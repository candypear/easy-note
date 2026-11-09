import { join } from 'node:path'
import { nanoid } from 'nanoid'
import type { MainContext, MainModule } from '@main/bootstrap/types'
import type { NoteContent, NoteSummary } from '@shared/contracts/note'
import type { NoteSaveResult } from '@shared/contracts/note-api'
import { NoteChannels } from '@shared/contracts/note-api'
import type { NoteId } from '@shared/types/brand'
import { asNoteId } from '@shared/types/brand'
import { AppError } from '@main/platform/errors'
import { sha256 } from '@main/platform/hash'
import {
  normalizeRelative,
  parentPathOf,
  resolveInVault,
  sanitizeName,
  titleFromPath,
  vaultRelative
} from '@main/platform/fs/path-safety'
import { withPathLock } from '@main/platform/fs/file-lock'
import { escapeLike, likePrefix } from '@main/platform/sql-like'
import type { SqliteDatabase } from '@main/platform/sqlite/connection'

interface NoteRow {
  id: string
  path: string
  title: string
  folder_id: string | null
  created_at: string
  modified_at: string
  content_hash: string | null
  size_bytes: number
}

interface NoteIndexMeta {
  contentHash: string
  size: number
  modifiedAt: string
}

class NoteRepository {
  constructor(private readonly db: SqliteDatabase) {}

  all(): NoteRow[] {
    return this.db
      .prepare<NoteRow>(
        'SELECT id, path, title, folder_id, created_at, modified_at, content_hash, size_bytes FROM notes ORDER BY title COLLATE NOCASE'
      )
      .all()
  }

  byId(id: string): NoteRow | null {
    return (
      this.db
        .prepare<NoteRow>(
          'SELECT id, path, title, folder_id, created_at, modified_at, content_hash, size_bytes FROM notes WHERE id = ?'
        )
        .get(id) ?? null
    )
  }

  byPath(path: string): NoteRow | null {
    return (
      this.db
        .prepare<NoteRow>(
          'SELECT id, path, title, folder_id, created_at, modified_at, content_hash, size_bytes FROM notes WHERE path = ?'
        )
        .get(path) ?? null
    )
  }

  byTitle(title: string): NoteRow[] {
    return this.db
      .prepare<NoteRow>(
        'SELECT id, path, title, folder_id, created_at, modified_at, content_hash, size_bytes FROM notes WHERE title = ? COLLATE NOCASE ORDER BY path'
      )
      .all(title)
  }

  listByPrefix(prefix: string): NoteRow[] {
    return this.db
      .prepare<NoteRow>(
        "SELECT id, path, title, folder_id, created_at, modified_at, content_hash, size_bytes FROM notes WHERE path LIKE ? ESCAPE '\\' ORDER BY title COLLATE NOCASE"
      )
      .all(likePrefix(prefix))
  }

  insert(row: NoteRow): void {
    this.db
      .prepare(
        'INSERT INTO notes (id, path, title, folder_id, created_at, modified_at, content_hash, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        row.id,
        row.path,
        row.title,
        row.folder_id,
        row.created_at,
        row.modified_at,
        row.content_hash,
        row.size_bytes
      )
  }

  updateMeta(id: string, path: string, title: string, folderId: string | null, meta: NoteIndexMeta): void {
    this.db
      .prepare(
        'UPDATE notes SET path = ?, title = ?, folder_id = ?, modified_at = ?, content_hash = ?, size_bytes = ? WHERE id = ?'
      )
      .run(path, title, folderId, meta.modifiedAt, meta.contentHash, meta.size, id)
  }

  updatePath(id: string, path: string, title: string, folderId: string | null): void {
    this.db
      .prepare('UPDATE notes SET path = ?, title = ?, folder_id = ? WHERE id = ?')
      .run(path, title, folderId, id)
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  }
}

const headingText = (line: string): string | null => {
  const match = line.match(/^(#{1,6})\s+(.*)$/)
  return match ? (match[2] ?? '') : null
}

const replaceFirstHeading = (content: string, oldTitle: string, newTitle: string): string => {
  const lines = content.split(/\r?\n/)
  const index = lines.findIndex((line) => headingText(line) !== null)
  if (index === -1) return content
  const line = lines[index] ?? ''
  const text = headingText(line)
  if (text === null || text.trim() !== oldTitle) return content
  lines[index] = line.replace(/(#{1,6}\s+).*$/, `$1${newTitle}`)
  return lines.join('\n')
}

export class NoteService {
  private repository: NoteRepository | null = null

  constructor(private readonly ctx: MainContext) {}

  private requireRoot(): { root: string; repository: NoteRepository } {
    const root = this.ctx.services.vault.root
    if (!root) throw new AppError('VAULT_NOT_READY')
    this.repository ??= new NoteRepository(this.ctx.db)
    return { root, repository: this.repository }
  }

  toSummary(row: NoteRow): NoteSummary {
    return {
      id: asNoteId(row.id),
      title: row.title,
      path: row.path,
      folderPath: parentPathOf(row.path),
      modifiedAt: row.modified_at
    }
  }

  async listAll(): Promise<NoteSummary[]> {
    const { repository } = this.requireRoot()
    return repository.all().map((row) => this.toSummary(row))
  }

  async listByPrefix(prefix: string): Promise<NoteSummary[]> {
    const { repository } = this.requireRoot()
    return repository.listByPrefix(normalizeRelative(prefix)).map((row) => this.toSummary(row))
  }

  async getMany(ids: NoteId[]): Promise<NoteSummary[]> {
    const { repository } = this.requireRoot()
    const set = new Set(ids)
    return repository
      .all()
      .filter((row) => set.has(asNoteId(row.id)))
      .map((row) => this.toSummary(row))
  }

  getRow(noteId: NoteId): NoteRow {
    const { repository } = this.requireRoot()
    const row = repository.byId(noteId)
    if (!row) throw new AppError('NOTE_NOT_FOUND')
    return row
  }

  findByPath(path: string): NoteSummary | null {
    const { repository } = this.requireRoot()
    const row = repository.byPath(normalizeRelative(path))
    return row ? this.toSummary(row) : null
  }

  resolve(title: string): NoteSummary[] {
    const { repository } = this.requireRoot()
    return repository.byTitle(title).map((row) => this.toSummary(row))
  }

  requireTitleRow(title: string): NoteRow | null {
    const { repository } = this.requireRoot()
    return repository.byTitle(title)[0] ?? null
  }

  async read(noteId: NoteId): Promise<NoteContent> {
    const { root, repository } = this.requireRoot()
    const row = this.getRow(noteId)
    try {
      const content = await this.ctx.fs.readFile(resolveInVault(root, row.path))
      return { ...this.toSummary(row), content }
    } catch {
      throw new AppError('FILE_READ_FAILED')
    }
  }

  async save(noteId: NoteId, content: string): Promise<NoteSaveResult> {
    const { root, repository } = this.requireRoot()
    const row = this.getRow(noteId)
    const absolute = resolveInVault(root, row.path)
    return withPathLock(absolute, async () => {
      const release = this.ctx.services.indexer.beginInternalWrite(absolute)
      try {
        await this.ctx.fs.writeFileAtomic(absolute, content)
        const stat = await this.ctx.fs.stat(absolute)
        const hash = sha256(content)
        const modifiedAt = new Date(stat.mtimeMs).toISOString()
        const folderId = this.ctx.services.folder.folderIdForPath(parentPathOf(row.path))
        repository.updateMeta(row.id, row.path, row.title, folderId ?? null, {
          contentHash: hash,
          size: stat.size,
          modifiedAt
        })
        try {
          await this.ctx.services.indexer.indexNote(noteId, content)
        } catch (error) {
          this.ctx.logger.error(`保存后建立索引失败 ${row.path}`, error)
        }
        this.ctx.events.publish('note:saved', { noteId })
        return { meta: this.toSummary(this.getRow(noteId)), indexedAt: new Date().toISOString() }
      } catch (error) {
        if (error instanceof AppError) throw error
        throw new AppError('FILE_WRITE_FAILED', `写入文件失败：${String(error)}`)
      } finally {
        release()
      }
    })
  }

  async create(folderPath: string | null, title?: string): Promise<NoteSummary> {
    const { root } = this.requireRoot()
    const folder = normalizeRelative(folderPath)
    if (folder) await this.ctx.services.folder.ensureExists(folder)
    const base = sanitizeName(title?.trim() || '未命名')
    const unique = await this.uniqueNotePath(folder, base)
    const content = `# ${unique.title}\n\n`
    const absolute = resolveInVault(root, unique.path)
    await this.ctx.fs.writeFileAtomic(absolute, content)
    const stat = await this.ctx.fs.stat(absolute)
    const now = new Date().toISOString()
    const row: NoteRow = {
      id: nanoid(12),
      path: unique.path,
      title: unique.title,
      folder_id: this.ctx.services.folder.folderIdForPath(folder) ?? null,
      created_at: now,
      modified_at: now,
      content_hash: sha256(content),
      size_bytes: stat.size
    }
    this.ctx.db
      .prepare(
        'INSERT INTO notes (id, path, title, folder_id, created_at, modified_at, content_hash, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        row.id,
        row.path,
        row.title,
        row.folder_id,
        row.created_at,
        row.modified_at,
        row.content_hash,
        row.size_bytes
      )
    await this.ctx.services.indexer.indexNote(asNoteId(row.id), content)
    this.ctx.events.publish('note:created', { noteId: asNoteId(row.id) })
    this.ctx.events.publish('folder:changed', { folderId: row.folder_id })
    return this.toSummary(row)
  }

  async rename(noteId: NoteId, title: string): Promise<NoteSummary> {
    const { root, repository } = this.requireRoot()
    const row = this.getRow(noteId)
    const clean = sanitizeName(title)
    if (clean === row.title) return this.toSummary(row)
    const folder = parentPathOf(row.path)
    const unique = await this.uniqueNotePath(folder, clean, row.path)
    const oldAbsolute = resolveInVault(root, row.path)
    const newAbsolute = resolveInVault(root, unique.path)
    await this.ctx.fs.rename(oldAbsolute, newAbsolute)
    const folderId = this.ctx.services.folder.folderIdForPath(folder)
    repository.updatePath(row.id, unique.path, unique.title, folderId ?? null)
    this.ctx.services.indexer.rebaseFileState(row.path, unique.path)

    let content = ''
    try {
      content = await this.ctx.fs.readFile(newAbsolute)
    } catch {
      content = ''
    }
    if (content) {
      const updated = replaceFirstHeading(content, row.title, unique.title)
      if (updated !== content) {
        await this.ctx.fs.writeFileAtomic(newAbsolute, updated)
        content = updated
      }
      await this.ctx.services.indexer.indexNote(noteId, content)
    }
    await this.ctx.services.link.relink(row.title, unique.title)
    this.ctx.events.publish('note:renamed', {
      noteId,
      oldTitle: row.title,
      newTitle: unique.title
    })
    return this.toSummary(this.getRow(noteId))
  }

  async move(noteId: NoteId, folderPath: string | null): Promise<NoteSummary> {
    const { root, repository } = this.requireRoot()
    const row = this.getRow(noteId)
    const folder = normalizeRelative(folderPath)
    if (folder) await this.ctx.services.folder.ensureExists(folder)
    const unique = await this.uniqueNotePath(folder, row.title, row.path)
    if (unique.path === row.path) return this.toSummary(row)
    await this.ctx.fs.rename(resolveInVault(root, row.path), resolveInVault(root, unique.path))
    repository.updatePath(
      row.id,
      unique.path,
      unique.title,
      this.ctx.services.folder.folderIdForPath(folder) ?? null
    )
    this.ctx.services.indexer.rebaseFileState(row.path, unique.path)
    this.ctx.events.publish('folder:changed', { folderId: null })
    return this.toSummary(this.getRow(noteId))
  }

  async duplicate(noteId: NoteId): Promise<NoteSummary> {
    const { root } = this.requireRoot()
    const row = this.getRow(noteId)
    const content = await this.ctx.fs.readFile(resolveInVault(root, row.path))
    const folder = parentPathOf(row.path)
    const unique = await this.uniqueNotePath(folder, `${row.title} 副本`)
    const absolute = resolveInVault(root, unique.path)
    await this.ctx.fs.writeFileAtomic(absolute, content)
    const stat = await this.ctx.fs.stat(absolute)
    const now = new Date().toISOString()
    const newRow: NoteRow = {
      id: nanoid(12),
      path: unique.path,
      title: unique.title,
      folder_id: this.ctx.services.folder.folderIdForPath(folder) ?? null,
      created_at: now,
      modified_at: now,
      content_hash: sha256(content),
      size_bytes: stat.size
    }
    this.requireRoot().repository.insert(newRow)
    await this.ctx.services.indexer.indexNote(asNoteId(newRow.id), content)
    this.ctx.events.publish('note:created', { noteId: asNoteId(newRow.id) })
    return this.toSummary(newRow)
  }

  async delete(noteId: NoteId): Promise<void> {
    const { root } = this.requireRoot()
    const row = this.getRow(noteId)
    await this.ctx.trash.trash(resolveInVault(root, row.path))
    await this.deleteRecords(noteId)
    this.ctx.events.publish('note:deleted', { noteId })
  }

  async deleteRecords(noteId: NoteId): Promise<void> {
    const { repository } = this.requireRoot()
    const row = repository.byId(noteId)
    if (!row) return
    this.ctx.services.block.removeForNote(noteId)
    this.ctx.services.link.removeForNote(noteId)
    this.ctx.services.tag.removeForNote(noteId)
    this.ctx.services.search.removeNote(noteId)
    repository.remove(noteId)
  }

  async deleteRecordsByPrefix(prefix: string): Promise<void> {
    const { repository } = this.requireRoot()
    const rows = repository.listByPrefix(normalizeRelative(prefix))
    for (const row of rows) {
      await this.deleteRecords(asNoteId(row.id))
      this.ctx.events.publish('note:deleted', { noteId: asNoteId(row.id) })
    }
  }

  ensureFromDisk(path: string, content: string, stat: { mtimeMs: number; size: number }): NoteRow {
    const { repository } = this.requireRoot()
    const relative = normalizeRelative(path)
    const title = titleFromPath(relative)
    const hash = sha256(content)
    const modifiedAt = new Date(stat.mtimeMs).toISOString()
    const folderId = this.ctx.services.folder.folderIdForPath(parentPathOf(relative)) ?? null
    const existing = repository.byPath(relative)
    if (existing) {
      repository.updateMeta(existing.id, relative, title, folderId, {
        contentHash: hash,
        size: stat.size,
        modifiedAt
      })
      return repository.byId(existing.id) ?? existing
    }
    const now = new Date().toISOString()
    const row: NoteRow = {
      id: nanoid(12),
      path: relative,
      title,
      folder_id: folderId,
      created_at: now,
      modified_at: modifiedAt,
      content_hash: hash,
      size_bytes: stat.size
    }
    repository.insert(row)
    return row
  }

  updateIndexed(noteId: NoteId, meta: NoteIndexMeta): void {
    const { repository } = this.requireRoot()
    const row = this.getRow(noteId)
    const folderId = this.ctx.services.folder.folderIdForPath(parentPathOf(row.path)) ?? null
    repository.updateMeta(
      row.id,
      row.path,
      titleFromPath(row.path),
      folderId,
      meta
    )
  }

  async rebasePaths(oldPrefix: string, newPrefix: string): Promise<void> {
    const { repository } = this.requireRoot()
    const rows = repository
      .all()
      .filter((row) => row.path.startsWith(`${oldPrefix}/`))
    for (const row of rows) {
      const nextPath = `${newPrefix}${row.path.slice(oldPrefix.length)}`
      repository.updatePath(
        row.id,
        nextPath,
        titleFromPath(nextPath),
        this.ctx.services.folder.folderIdForPath(parentPathOf(nextPath)) ?? null
      )
    }
    if (rows.length > 0) {
      this.ctx.events.publish('index:updated', {
        noteIds: rows.map((row) => asNoteId(row.id))
      })
    }
  }

  async reindexPrefix(prefix: string): Promise<void> {
    const { root, repository } = this.requireRoot()
    const rows = repository.listByPrefix(normalizeRelative(prefix))
    for (const row of rows) {
      try {
        const content = await this.ctx.fs.readFile(resolveInVault(root, row.path))
        await this.ctx.services.indexer.indexNote(asNoteId(row.id), content)
      } catch (error) {
        this.ctx.logger.error(`重建索引失败 ${row.path}`, error)
      }
    }
  }

  private async uniqueNotePath(
    folder: string,
    base: string,
    ignorePath?: string
  ): Promise<{ path: string; title: string }> {
    const { root } = this.requireRoot()
    let title = base
    let index = 2
    let path = folder ? `${folder}/${title}.md` : `${title}.md`
    while (path !== ignorePath && (await this.ctx.fs.exists(resolveInVault(root, path)))) {
      title = `${base} ${index}`
      path = folder ? `${folder}/${title}.md` : `${title}.md`
      index += 1
    }
    return { path, title }
  }
}

export interface NoteModule extends MainModule {
  service: NoteService
}

export const noteMigrations = [
  {
    id: 'note@1',
    up(db: SqliteDatabase) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY NOT NULL,
          path TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          folder_id TEXT,
          created_at TEXT NOT NULL,
          modified_at TEXT NOT NULL,
          content_hash TEXT,
          size_bytes INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
        CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_notes_path ON notes(path);
      `)
    }
  }
]

export function createNoteModule(ctx: MainContext): NoteModule {
  const service = new NoteService(ctx)
  return {
    id: 'note',
    migrations: noteMigrations,
    service,
    registerIpc(ipc) {
      const noteId = (payload: unknown): NoteId => {
        if (typeof payload !== 'string') throw new AppError('INVALID_REQUEST')
        return asNoteId(payload)
      }
      ipc.handle(NoteChannels.listAll, () => service.listAll())
      ipc.handle(NoteChannels.get, (payload) => service.toSummary(service.getRow(noteId(payload))))
      ipc.handle(NoteChannels.read, (payload) => service.read(noteId(payload)))
      ipc.handle(NoteChannels.save, async (payload) => {
        if (!payload || typeof payload !== 'object' || !('noteId' in payload) || !('content' in payload)) {
          throw new AppError('INVALID_REQUEST')
        }
        if (typeof payload.content !== 'string') throw new AppError('INVALID_REQUEST')
        return service.save(asNoteId(String(payload.noteId)), payload.content)
      })
      ipc.handle(NoteChannels.create, async (payload) => {
        if (!payload || typeof payload !== 'object') throw new AppError('INVALID_REQUEST')
        const folder = 'folderPath' in payload && typeof payload.folderPath === 'string'
          ? payload.folderPath
          : null
        const title = 'title' in payload && typeof payload.title === 'string' ? payload.title : undefined
        return service.create(folder, title)
      })
      ipc.handle(NoteChannels.rename, async (payload) => {
        if (!payload || typeof payload !== 'object' || !('noteId' in payload) || !('title' in payload)) {
          throw new AppError('INVALID_REQUEST')
        }
        return service.rename(asNoteId(String(payload.noteId)), String(payload.title))
      })
      ipc.handle(NoteChannels.move, async (payload) => {
        if (!payload || typeof payload !== 'object' || !('noteId' in payload)) {
          throw new AppError('INVALID_REQUEST')
        }
        const folder = 'folderPath' in payload && typeof payload.folderPath === 'string'
          ? payload.folderPath
          : null
        return service.move(asNoteId(String(payload.noteId)), folder)
      })
      ipc.handle(NoteChannels.duplicate, (payload) => service.duplicate(noteId(payload)))
      ipc.handle(NoteChannels.delete, (payload) => service.delete(noteId(payload)))
      ipc.handle(NoteChannels.resolve, (payload) => {
        if (typeof payload !== 'string') throw new AppError('INVALID_REQUEST')
        return service.resolve(payload)
      })
    }
  }
}
