// 索引器模块：监听 vault 文件变化并维护 SQLite 派生索引（块/链接/标签/全文），
// 提供全量扫描、单文件增量索引与重建；file_state 表记录文件指纹用于跳过未变更文件。
import { join } from 'node:path'
import type { MainContext, MainModule } from '@main/bootstrap/types'
import type { RebuildIndexResult } from '@shared/contracts/settings'
import type { NoteId } from '@shared/types/brand'
import { asNoteId } from '@shared/types/brand'
import { sha256 } from '@main/platform/hash'
import { vaultRelative } from '@main/platform/fs/path-safety'
import { parseMarkdownBlocks } from '@shared/utils/markdown'
import { withPathLock } from '@main/platform/fs/file-lock'
import { likePrefix } from '@main/platform/sql-like'
import type { SqliteDatabase } from '@main/platform/sqlite/connection'

interface FileStateRow {
  path: string
  mtime: number
  size: number
  content_hash: string | null
  last_indexed_at: string
}

class IndexerRepository {
  constructor(private readonly db: SqliteDatabase) {}

  get(path: string): FileStateRow | null {
    return (
      this.db
        .prepare<FileStateRow>(
          'SELECT path, mtime, size, content_hash, last_indexed_at FROM file_state WHERE path = ?'
        )
        .get(path) ?? null
    )
  }

  upsert(row: FileStateRow): void {
    this.db
      .prepare(
        `INSERT INTO file_state (path, mtime, size, content_hash, last_indexed_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           mtime = excluded.mtime, size = excluded.size,
           content_hash = excluded.content_hash, last_indexed_at = excluded.last_indexed_at`
      )
      .run(row.path, row.mtime, row.size, row.content_hash, row.last_indexed_at)
  }

  remove(path: string): void {
    this.db.prepare('DELETE FROM file_state WHERE path = ?').run(path)
  }

  rebase(oldPrefix: string, newPrefix: string): void {
    const rows = this.db
      .prepare<FileStateRow>("SELECT * FROM file_state WHERE path LIKE ? ESCAPE '\\'")
      .all(likePrefix(oldPrefix))
    for (const row of rows) {
      const next = `${newPrefix}${row.path.slice(oldPrefix.length)}`
      this.db.prepare('UPDATE file_state SET path = ? WHERE path = ?').run(next, row.path)
    }
  }

  rename(oldPath: string, newPath: string): void {
    this.db.prepare('UPDATE file_state SET path = ? WHERE path = ?').run(newPath, oldPath)
  }

  clear(): void {
    this.db.prepare('DELETE FROM file_state').run()
  }
}

export class IndexerService {
  private repository: IndexerRepository | null = null
  private subscriptions: (() => void)[] = []
  private timers = new Map<string, NodeJS.Timeout>()
  private internalWrites = new Set<string>()
  private scanPromise: Promise<number> | null = null
  private scanning = false

  constructor(private readonly ctx: MainContext) {}

  private repo(): IndexerRepository {
    this.repository ??= new IndexerRepository(this.ctx.db)
    return this.repository
  }

  async start(): Promise<void> {
    this.subscriptions.push(
      this.ctx.events.subscribe('vault:changed', (payload) => {
        void this.onVaultChanged(payload.path)
      })
    )
    const root = this.ctx.services.vault.root
    if (root) await this.onVaultChanged(root)
  }

  async stop(): Promise<void> {
    for (const unsubscribe of this.subscriptions) unsubscribe()
    this.subscriptions = []
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    await this.ctx.watcher.stop()
  }

  // vault 打开/切换时：停掉旧 watcher 与防抖定时器，再启动新监听并触发一次非强制扫描
  private async onVaultChanged(path: string | null): Promise<void> {
    await this.ctx.watcher.stop()
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    if (!path || !this.ctx.db.isOpen) return
    try {
      await this.ctx.watcher.start(path, (type, absolutePath) => {
        this.enqueue(type, absolutePath)
      })
    } catch (error) {
      this.ctx.logger.error('启动文件监听失败', error)
    }
    void this.scan(false)
  }

  // 按路径防抖 220ms：合并编辑器/系统产生的重复事件，避免索引到写了一半的文件
  private enqueue(type: 'add' | 'change' | 'unlink', absolutePath: string): void {
    const current = this.timers.get(absolutePath)
    clearTimeout(current)
    this.timers.set(
      absolutePath,
      setTimeout(() => {
        this.timers.delete(absolutePath)
        if (type === 'unlink') {
          void this.handleUnlink(absolutePath)
        } else {
          void this.indexFile(absolutePath, { external: type === 'change' }).catch((error) => {
            this.ctx.logger.error(`索引文件失败 ${absolutePath}`, error)
          })
        }
      }, 220)
    )
  }

  // 文件被删除：清理 file_state 与笔记的全部索引记录，重解析链接（指向它的链接变失效）并广播删除
  private async handleUnlink(absolutePath: string): Promise<void> {
    const root = this.ctx.services.vault.root
    if (!root) return
    const relative = vaultRelative(root, absolutePath)
    const note = this.ctx.services.note.findByPath(relative)
    this.repo().remove(relative)
    if (!note) return
    await this.ctx.services.note.deleteRecords(note.id)
    this.ctx.services.link.resolveAll()
    this.ctx.events.publish('note:deleted', { noteId: note.id })
  }

  // 标记应用内部写入，使 watcher 触发的 change 不被误判为“外部修改”；返回解除标记的函数
  beginInternalWrite(absolutePath: string): () => void {
    this.internalWrites.add(absolutePath)
    return () => this.internalWrites.delete(absolutePath)
  }

  // 并发调用共享同一个扫描 Promise，防止重入导致重复索引
  async scan(force: boolean): Promise<number> {
    if (this.scanning) return this.scanPromise ?? Promise.resolve(0)
    const root = this.ctx.services.vault.root
    if (!root || !this.ctx.db.isOpen) return 0
    this.scanning = true
    this.scanPromise = this.runScan(root, force).finally(() => {
      this.scanning = false
      this.scanPromise = null
    })
    return this.scanPromise
  }

  // 全量扫描：先同步目录树，再递归收集 .md 文件（跳过隐藏项与 .easynote），
  // 逐个增量索引并广播进度；单文件失败只记日志不中断
  private async runScan(root: string, force: boolean): Promise<number> {
    await this.ctx.services.folder.syncFromDisk()
    const files: string[] = []
    const walk = async (directory: string): Promise<void> => {
      const entries = await this.ctx.fs.readdir(directory)
      for (const entry of entries) {
        if (entry.name === '.easynote' || entry.name.startsWith('.')) continue
        const absolute = join(directory, entry.name)
        if (entry.isDirectory) await walk(absolute)
        else if (entry.isFile && entry.name.toLowerCase().endsWith('.md')) files.push(absolute)
      }
    }
    try {
      await walk(root)
    } catch (error) {
      this.ctx.logger.error('扫描笔记库失败', error)
      return 0
    }
    this.ctx.events.publish('index:progress', { phase: 'scan', current: 0, total: files.length })
    let indexed = 0
    for (const file of files) {
      try {
        const changed = await this.indexFile(file, { force })
        if (changed) indexed += 1
      } catch (error) {
        this.ctx.logger.error(`索引文件失败 ${file}`, error)
      }
      this.ctx.events.publish('index:progress', {
        phase: 'scan',
        current: indexed,
        total: files.length
      })
    }
    // 扫描结束后统一重解析链接：处理前向引用（目标笔记在源笔记之后才被索引）
    this.ctx.services.link.resolveAll()
    const now = new Date().toISOString()
    await this.ctx.services.settings.setLastIndexedAt(now)
    this.ctx.events.publish('index:progress', { phase: 'done', current: files.length, total: files.length })
    return indexed
  }

  // 索引单个磁盘文件：路径锁防并发；指纹（hash+size）未变则跳过；
  // 外部修改（非应用写入且内容变化）会广播事件供前端提示冲突
  async indexFile(
    absolutePath: string,
    options: { force?: boolean; external?: boolean } = {}
  ): Promise<boolean> {
    const root = this.ctx.services.vault.root
    if (!root) return false
    return withPathLock(absolutePath, async () => {
      const relative = vaultRelative(root, absolutePath)
      const content = await this.ctx.fs.readFile(absolutePath)
      const stat = await this.ctx.fs.stat(absolutePath)
      const hash = sha256(content)
      const state = this.repo().get(relative)
      const row = this.ctx.services.note.ensureFromDisk(relative, content, stat)
      const unchanged =
        !options.force &&
        state !== null &&
        state.content_hash === hash &&
        state.size === stat.size &&
        row.content_hash === hash
      if (unchanged) return false

      if (
        options.external &&
        state !== null &&
        state.content_hash !== null &&
        state.content_hash !== hash &&
        !this.internalWrites.has(absolutePath)
      ) {
        this.ctx.events.publish('note:external-change', {
          noteId: asNoteId(row.id),
          diskHash: hash
        })
      }

      // 依次重建派生索引：块 -> 链接 -> 标签 -> 全文，最后回写笔记元数据与 file_state 指纹
      const parsed = parseMarkdownBlocks(content)
      this.ctx.services.block.sync(asNoteId(row.id), parsed.blocks)
      const blocks = this.ctx.services.block.listByNote(asNoteId(row.id))
      this.ctx.services.link.sync(asNoteId(row.id), blocks)
      this.ctx.services.tag.sync(asNoteId(row.id), content)
      this.ctx.services.search.index(asNoteId(row.id), row.title, parsed.plainText)
      this.ctx.services.note.updateIndexed(asNoteId(row.id), {
        contentHash: hash,
        size: stat.size,
        modifiedAt: new Date(stat.mtimeMs).toISOString()
      })
      this.repo().upsert({
        path: relative,
        mtime: Math.round(stat.mtimeMs),
        size: stat.size,
        content_hash: hash,
        last_indexed_at: new Date().toISOString()
      })
      this.ctx.events.publish('index:updated', { noteIds: [asNoteId(row.id)] })
      return true
    })
  }

  // 应用内保存后的同步索引入口：内容已在手，无需重读磁盘或做指纹比对；
  // 完成后立即重解析链接并广播，保证保存后反向链接等即时可见
  async indexNote(noteId: NoteId, content: string): Promise<void> {
    const root = this.ctx.services.vault.root
    if (!root) return
    const row = this.ctx.services.note.getRow(noteId)
    const absolutePath = join(root, row.path)
    const stat = await this.ctx.fs.stat(absolutePath)
    const hash = sha256(content)
    const parsed = parseMarkdownBlocks(content)
    this.ctx.services.block.sync(noteId, parsed.blocks)
    const blocks = this.ctx.services.block.listByNote(noteId)
    this.ctx.services.link.sync(noteId, blocks)
    this.ctx.services.tag.sync(noteId, content)
    this.ctx.services.search.index(noteId, row.title, parsed.plainText)
    this.ctx.services.note.updateIndexed(noteId, {
      contentHash: hash,
      size: stat.size,
      modifiedAt: new Date(stat.mtimeMs).toISOString()
    })
    this.repo().upsert({
      path: row.path,
      mtime: Math.round(stat.mtimeMs),
      size: stat.size,
      content_hash: hash,
      last_indexed_at: new Date().toISOString()
    })
    this.ctx.services.link.resolveAll()
    this.ctx.events.publish('index:updated', { noteIds: [noteId] })
  }

  // 重建索引：清空 file_state 指纹后强制全量扫描，使所有文件重新索引
  async rebuild(): Promise<RebuildIndexResult> {
    this.repo().clear()
    const indexed = await this.scan(true)
    return { indexed }
  }

  rebaseFileState(oldPath: string, newPath: string): void {
    this.repo().rename(oldPath, newPath)
  }

  rebasePaths(oldPrefix: string, newPrefix: string): void {
    this.repo().rebase(oldPrefix, newPrefix)
  }
}

export interface IndexerModule extends MainModule {
  service: IndexerService
}

export const indexerMigrations = [
  {
    id: 'indexer@1',
    up(db: SqliteDatabase) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS file_state (
          path TEXT PRIMARY KEY NOT NULL,
          mtime INTEGER NOT NULL,
          size INTEGER NOT NULL,
          content_hash TEXT,
          last_indexed_at TEXT NOT NULL
        );
      `)
    }
  }
]

export function createIndexerModule(ctx: MainContext): IndexerModule {
  const service = new IndexerService(ctx)
  return {
    id: 'indexer',
    migrations: indexerMigrations,
    service,
    registerIpc() {},
    async start() {
      await service.start()
    },
    async stop() {
      await service.stop()
    }
  }
}
