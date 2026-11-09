import { join, resolve } from 'node:path'
import { nanoid } from 'nanoid'
import type { MainContext, MainModule } from '@main/bootstrap/types'
import type { VaultInfo } from '@shared/contracts/vault'
import { VaultChannels } from '@shared/contracts/vault'
import { AppError } from '@main/platform/errors'
import { applyMigrations } from '@main/bootstrap/migrations'
import type { SqliteDatabase } from '@main/platform/sqlite/connection'

const SAMPLE_NOTE = [
  '# 欢迎使用 EasyNote',
  '',
  '这是一篇本地 Markdown 笔记。正文始终是纯文本文件，可直接用任意编辑器打开。',
  '',
  '## 快速开始',
  '',
  '- 输入 `# ` 创建标题',
  '- 输入 `- [ ] ` 创建任务',
  '- 输入 `[[` 链接到其他笔记',
  '- 使用 `/` 插入代码块或公式',
  '',
  '> EasyNote 只在本地读写文件，没有任何账号或云端同步。',
  '',
  '```ts',
  'export function greet(name: string): string {',
  '  return `Hello, ${name}`',
  '}',
  '```',
  '',
  '$$',
  '\\int_{0}^{1} x^2 \\, dx = \\frac{1}{3}',
  '$$',
  '',
  '试试链接到一篇尚未创建的笔记：[[我的第一篇笔记]]。',
  '',
  '标签：#开始 #示例'
].join('\n')

class VaultRepository {
  constructor(private readonly db: SqliteDatabase) {}

  get(key: string): string | null {
    const row = this.db.prepare<{ value: string }>('SELECT value FROM vault_meta WHERE key = ?').get(key)
    return row?.value ?? null
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO vault_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value)
  }
}

export class VaultService {
  root: string | null = null
  info: VaultInfo | null = null
  private repository: VaultRepository | null = null

  constructor(private readonly ctx: MainContext) {}

  get isOpen(): boolean {
    return this.root !== null && this.ctx.db.isOpen
  }

  current(): VaultInfo | null {
    return this.info ? { ...this.info } : null
  }

  suggestPath(): string {
    return join(this.ctx.paths.documents, 'EasyNote')
  }

  async pickFolder(): Promise<string | null> {
    return this.ctx.dialog.pickFolder('选择笔记库文件夹')
  }

  async start(): Promise<void> {
    const target = this.ctx.services.settings.get().vaultPath
    if (!target) return
    try {
      if (!(await this.ctx.fs.exists(target))) return
      await this.open(target)
    } catch (error) {
      this.ctx.logger.error('打开上次的笔记库失败', error)
      await this.ctx.services.settings.setVaultPath(null).catch(() => undefined)
    }
  }

  async open(path: string): Promise<VaultInfo> {
    const target = resolve(path)
    const stat = await this.ctx.fs.stat(target).catch(() => null)
    if (stat && stat.isFile) throw new AppError('VAULT_INVALID')
    await this.ctx.fs.mkdirp(target)

    const internal = join(target, '.easynote')
    const temporary = join(internal, 'tmp')
    try {
      await this.ctx.fs.mkdirp(temporary)
      const probe = join(internal, '.write-probe')
      await this.ctx.fs.writeFileAtomic(probe, '')
      await this.ctx.fs.remove(probe)
    } catch {
      throw new AppError('VAULT_WRITE_DENIED')
    }

    this.ctx.db.close()
    try {
      this.ctx.db.open(join(internal, 'index.db'))
      applyMigrations(this.ctx)
    } catch (error) {
      this.ctx.db.close()
      throw new AppError('VAULT_OPEN_FAILED', `无法初始化索引：${String(error)}`)
    }

    this.repository = new VaultRepository(this.ctx.db)
    const previous = this.repository.get('vault_id')
    const id = previous ?? nanoid(12)
    this.repository.set('vault_id', id)
    this.repository.set('created_at', this.repository.get('created_at') ?? new Date().toISOString())
    this.repository.set('name', target.split(/[\\/]/).filter(Boolean).pop() ?? 'EasyNote')

    this.root = target
    this.info = {
      id,
      path: target,
      name: this.repository.get('name') ?? 'EasyNote',
      openedAt: new Date().toISOString()
    }

    await this.seedSample()
    await this.ctx.services.settings.setVaultPath(target)
    this.ctx.events.publish('vault:changed', { vaultId: id, path: target })
    return this.current() ?? { id, path: target, name: 'EasyNote', openedAt: new Date().toISOString() }
  }

  private async seedSample(): Promise<void> {
    if (!this.root || !this.repository) return
    const seeded = this.repository.get('seeded') === '1'
    if (seeded) return
    const markdown = await this.listMarkdownFiles(this.root)
    if (markdown.length === 0) {
      await this.ctx.fs.writeFileAtomic(join(this.root, '欢迎使用 EasyNote.md'), SAMPLE_NOTE)
    }
    this.repository.set('seeded', '1')
  }

  private async listMarkdownFiles(directory: string): Promise<string[]> {
    const result: string[] = []
    const entries = await this.ctx.fs.readdir(directory)
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const absolute = join(directory, entry.name)
      if (entry.isDirectory) {
        result.push(...(await this.listMarkdownFiles(absolute)))
      } else if (entry.isFile && entry.name.toLowerCase().endsWith('.md')) {
        result.push(absolute)
      }
    }
    return result
  }
}

export interface VaultModule extends MainModule {
  service: VaultService
}

export const vaultMigrations = [
  {
    id: 'vault@1',
    up(db: SqliteDatabase) {
      db.exec(
        'CREATE TABLE IF NOT EXISTS vault_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)'
      )
    }
  }
]

export function createVaultModule(ctx: MainContext): VaultModule {
  const service = new VaultService(ctx)
  return {
    id: 'vault',
    migrations: vaultMigrations,
    service,
    registerIpc(ipc) {
      ipc.handle(VaultChannels.suggestPath, () => service.suggestPath())
      ipc.handle(VaultChannels.pickFolder, () => service.pickFolder())
      ipc.handle(VaultChannels.current, () => service.current())
      ipc.handle(VaultChannels.open, async (payload) => {
        if (typeof payload !== 'string' || payload.trim() === '') throw new AppError('INVALID_REQUEST')
        return service.open(payload)
      })
    },
    async start() {
      await service.start()
    }
  }
}
