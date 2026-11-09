import { nanoid } from 'nanoid'
import type { MainContext, MainModule } from '@main/bootstrap/types'
import type { TagDTO, TagFilterMode, TagFilterResult } from '@shared/contracts/tag'
import { TagChannels } from '@shared/contracts/tag'
import type { NoteId } from '@shared/types/brand'
import { asNoteId, asTagId } from '@shared/types/brand'
import { AppError } from '@main/platform/errors'
import { extractTags, replaceTagInMarkdown } from '@shared/utils/markdown'
import type { SqliteDatabase } from '@main/platform/sqlite/connection'

interface TagRow {
  id: string
  name: string
}

class TagRepository {
  constructor(private readonly db: SqliteDatabase) {}

  ensure(name: string): string {
    const existing = this.db
      .prepare<{ id: string }>('SELECT id FROM tags WHERE name = ?')
      .get(name)
    if (existing) return existing.id
    const id = nanoid(12)
    this.db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(id, name)
    return id
  }

  byName(name: string): TagRow | null {
    return (
      this.db.prepare<TagRow>('SELECT id, name FROM tags WHERE name = ?').get(name) ?? null
    )
  }

  clearNote(noteId: string): void {
    this.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId)
  }

  link(noteId: string, tagId: string): void {
    this.db
      .prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)')
      .run(noteId, tagId)
  }

  list(): TagDTO[] {
    return this.db
      .prepare<{ id: string; name: string; count: number }>(
        `SELECT t.id AS id, t.name AS name, COUNT(nt.note_id) AS count
         FROM tags t JOIN note_tags nt ON nt.tag_id = t.id
         GROUP BY t.id, t.name
         ORDER BY t.name COLLATE NOCASE`
      )
      .all()
      .map((row) => ({ id: asTagId(row.id), name: row.name, count: row.count }))
  }

  noteIdsFor(name: string): string[] {
    return this.db
      .prepare<{ note_id: string }>(
        'SELECT nt.note_id FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE t.name = ?'
      )
      .all(name)
      .map((row) => row.note_id)
  }

  filter(names: string[], mode: TagFilterMode): string[] {
    if (names.length === 0) return []
    const placeholders = names.map(() => '?').join(', ')
    if (mode === 'and') {
      return this.db
        .prepare<{ note_id: string }>(
          `SELECT nt.note_id FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
           WHERE t.name IN (${placeholders})
           GROUP BY nt.note_id HAVING COUNT(DISTINCT t.name) = ?
           ORDER BY nt.note_id`
        )
        .all(...names, names.length)
        .map((row) => row.note_id)
    }
    return this.db
      .prepare<{ note_id: string }>(
        `SELECT DISTINCT nt.note_id FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
         WHERE t.name IN (${placeholders}) ORDER BY nt.note_id`
      )
      .all(...names)
      .map((row) => row.note_id)
  }

  merge(oldId: string, newId: string): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO note_tags (note_id, tag_id) SELECT note_id, ? FROM note_tags WHERE tag_id = ?'
      )
      .run(newId, oldId)
    this.db.prepare('DELETE FROM note_tags WHERE tag_id = ?').run(oldId)
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(oldId)
  }

  rename(id: string, name: string): void {
    this.db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id)
  }

  remove(name: string): void {
    const row = this.byName(name)
    if (!row) return
    this.db.prepare('DELETE FROM note_tags WHERE tag_id = ?').run(row.id)
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(row.id)
  }

  clearNoteTags(noteId: string): void {
    this.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId)
  }

  cleanup(): void {
    this.db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM note_tags)').run()
  }
}

const sanitizeTagName = (value: string): string => {
  const cleaned = value.trim().replace(/^#/, '').replace(/\s+/g, '-')
  if (!cleaned || /[#[\]\n]/.test(cleaned)) throw new AppError('INVALID_REQUEST', '标签名无效')
  return cleaned
}

export class TagService {
  private repository: TagRepository | null = null

  constructor(private readonly ctx: MainContext) {}

  private repo(): TagRepository {
    this.repository ??= new TagRepository(this.ctx.db)
    return this.repository
  }

  sync(noteId: NoteId, markdown: string): void {
    const repository = this.repo()
    const tags = [...new Set(extractTags(markdown))]
    this.ctx.db.transaction(() => {
      repository.clearNote(noteId)
      for (const tag of tags) {
        repository.link(noteId, repository.ensure(tag))
      }
      repository.cleanup()
    })
  }

  list(): TagDTO[] {
    return this.repo().list()
  }

  async filter(names: string[], mode: TagFilterMode): Promise<TagFilterResult> {
    const ids = this.repo().filter([...new Set(names)], mode)
    return { notes: await this.ctx.services.note.getMany(ids.map((id) => asNoteId(id))) }
  }

  async rename(oldName: string, newName: string): Promise<TagDTO> {
    const repository = this.repo()
    const oldRow = repository.byName(oldName)
    if (!oldRow) throw new AppError('TAG_NOT_FOUND')
    const clean = sanitizeTagName(newName)
    if (clean === oldName) {
      return { id: asTagId(oldRow.id), name: oldRow.name, count: repository.noteIdsFor(oldName).length }
    }
    const noteIds = repository.noteIdsFor(oldName)
    for (const noteId of noteIds) {
      const note = await this.ctx.services.note.read(asNoteId(noteId))
      const updated = replaceTagInMarkdown(note.content, oldName, clean)
      if (updated !== note.content) await this.ctx.services.note.save(asNoteId(noteId), updated)
    }
    const conflict = repository.byName(clean)
    if (conflict) repository.merge(oldRow.id, conflict.id)
    else repository.rename(oldRow.id, clean)
    repository.cleanup()
    const row = repository.byName(clean)
    return {
      id: asTagId(row?.id ?? oldRow.id),
      name: clean,
      count: repository.noteIdsFor(clean).length
    }
  }

  async delete(name: string): Promise<void> {
    const repository = this.repo()
    const row = repository.byName(name)
    if (!row) throw new AppError('TAG_NOT_FOUND')
    const noteIds = repository.noteIdsFor(name)
    for (const noteId of noteIds) {
      const note = await this.ctx.services.note.read(asNoteId(noteId))
      const updated = replaceTagInMarkdown(note.content, name, null)
      if (updated !== note.content) await this.ctx.services.note.save(asNoteId(noteId), updated)
    }
    repository.remove(name)
    repository.cleanup()
  }

  removeForNote(noteId: NoteId): void {
    this.repo().clearNoteTags(noteId)
    this.repo().cleanup()
  }
}

export interface TagModule extends MainModule {
  service: TagService
}

export const tagMigrations = [
  {
    id: 'tag@1',
    up(db: SqliteDatabase) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tags (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS note_tags (
          note_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          PRIMARY KEY (note_id, tag_id)
        );
        CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_note_tags_note ON note_tags(note_id);
      `)
    }
  }
]

export function createTagModule(ctx: MainContext): TagModule {
  const service = new TagService(ctx)
  return {
    id: 'tag',
    migrations: tagMigrations,
    service,
    registerIpc(ipc) {
      ipc.handle(TagChannels.list, () => service.list())
      ipc.handle(TagChannels.filter, (payload) => {
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('names' in payload) ||
          !Array.isArray(payload.names) ||
          !('mode' in payload)
        ) {
          throw new AppError('INVALID_REQUEST')
        }
        const mode = payload.mode === 'or' ? 'or' : 'and'
        return service.filter(payload.names.map(String), mode)
      })
      ipc.handle(TagChannels.rename, (payload) => {
        if (!payload || typeof payload !== 'object' || !('oldName' in payload) || !('newName' in payload)) {
          throw new AppError('INVALID_REQUEST')
        }
        return service.rename(String(payload.oldName), String(payload.newName))
      })
      ipc.handle(TagChannels.delete, (payload) => {
        if (typeof payload !== 'string') throw new AppError('INVALID_REQUEST')
        return service.delete(payload)
      })
    }
  }
}
