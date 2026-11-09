import type { MainContext, MainModule } from '@main/bootstrap/types'
import type { QuickSwitchHit, SearchHit } from '@shared/contracts/search'
import { SearchChannels } from '@shared/contracts/search'
import type { NoteSummary } from '@shared/contracts/note'
import type { BlockId, NoteId } from '@shared/types/brand'
import { asNoteId } from '@shared/types/brand'
import { AppError } from '@main/platform/errors'
import { escapeLike } from '@main/platform/sql-like'
import type { SqliteDatabase } from '@main/platform/sqlite/connection'

interface DocRow {
  note_id: string
  title: string
  plain_text: string
}

class SearchRepository {
  constructor(private readonly db: SqliteDatabase) {}

  hasFts(): boolean {
    return Boolean(
      this.db
        .prepare<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notes_fts'")
        .get()
    )
  }

  upsert(noteId: string, title: string, plainText: string): void {
    this.db
      .prepare(
        'INSERT INTO search_docs (note_id, title, plain_text) VALUES (?, ?, ?) ON CONFLICT(note_id) DO UPDATE SET title = excluded.title, plain_text = excluded.plain_text'
      )
      .run(noteId, title, plainText)
    if (this.hasFts()) {
      this.db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(noteId)
      this.db
        .prepare('INSERT INTO notes_fts (note_id, title, plain_text) VALUES (?, ?, ?)')
        .run(noteId, title, plainText)
    }
  }

  remove(noteId: string): void {
    this.db.prepare('DELETE FROM search_docs WHERE note_id = ?').run(noteId)
    if (this.hasFts()) this.db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(noteId)
  }

  match(query: string): { note_id: string; title: string; snippet: string; rank: number }[] {
    return this.db
      .prepare<{ note_id: string; title: string; snippet: string; rank: number }>(
        `SELECT note_id, title, snippet(notes_fts, 2, '', '', '…', 20) AS snippet, bm25(notes_fts) AS rank
         FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rank LIMIT 100`
      )
      .all(query)
  }

  like(query: string): DocRow[] {
    return this.db
      .prepare<DocRow>(
        "SELECT note_id, title, plain_text FROM search_docs WHERE title LIKE ? ESCAPE '\\' OR plain_text LIKE ? ESCAPE '\\' ORDER BY title COLLATE NOCASE LIMIT 100"
      )
      .all(`%${escapeLike(query)}%`, `%${escapeLike(query)}%`)
  }
}

const ftsExpression = (query: string): string =>
  query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(' AND ')

const snippetAround = (text: string, query: string): string => {
  const normalized = text.replace(/\s+/g, ' ')
  const index = normalized.toLowerCase().indexOf(query.toLowerCase())
  if (index === -1) return normalized.slice(0, 80)
  const start = Math.max(0, index - 36)
  const end = Math.min(normalized.length, index + query.length + 48)
  return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`
}

export class SearchService {
  private repository: SearchRepository | null = null

  constructor(private readonly ctx: MainContext) {}

  private repo(): SearchRepository {
    this.repository ??= new SearchRepository(this.ctx.db)
    return this.repository
  }

  index(noteId: NoteId, title: string, plainText: string): void {
    this.repo().upsert(noteId, title, plainText)
  }

  removeNote(noteId: NoteId): void {
    this.repo().remove(noteId)
  }

  async search(query: string): Promise<SearchHit[]> {
    const trimmed = query.trim()
    if (!trimmed) return []
    const repository = this.repo()
    let raw: { note_id: string; title: string; snippet: string; score: number }[] = []
    try {
      if (repository.hasFts() && trimmed.length >= 3) {
        raw = repository.match(ftsExpression(trimmed)).map((row) => ({
          note_id: row.note_id,
          title: row.title,
          snippet: row.snippet,
          score: -row.rank
        }))
      }
    } catch {
      raw = []
    }
    if (raw.length === 0) {
      raw = repository.like(trimmed).map((row) => ({
        note_id: row.note_id,
        title: row.title,
        snippet: snippetAround(row.plain_text, trimmed),
        score: 1
      }))
    }
    const notes = await this.ctx.services.note.getMany(
      [...new Set(raw.map((row) => asNoteId(row.note_id)))]
    )
    const byId = new Map(notes.map((note) => [note.id, note]))
    const needle = trimmed.toLowerCase()
    const blockIds = new Map<NoteId, BlockId | null>()
    for (const id of byId.keys()) {
      const hit = this.ctx.services.block
        .listByNote(id)
        .find((block) => block.plainText.toLowerCase().includes(needle))
      blockIds.set(id, hit?.id ?? null)
    }
    return raw
      .map((row) => {
        const note = byId.get(asNoteId(row.note_id))
        if (!note) return null
        return {
          noteId: note.id,
          blockId: blockIds.get(note.id) ?? null,
          title: note.title,
          path: note.path,
          snippet: row.snippet,
          modifiedAt: note.modifiedAt,
          score: row.score
        }
      })
      .filter((row): row is SearchHit => row !== null)
  }

  async quickSwitch(query: string): Promise<QuickSwitchHit[]> {
    const notes = await this.ctx.services.note.listAll()
    const trimmed = query.trim().toLowerCase()
    const recent = new Set(this.ctx.services.settings.get().recentNoteIds)
    const matches = trimmed
      ? notes.filter((note) => note.title.toLowerCase().includes(trimmed))
      : notes
    const order = (left: NoteSummary, right: NoteSummary): number => {
      const leftRecent = recent.has(left.id) ? 0 : 1
      const rightRecent = recent.has(right.id) ? 0 : 1
      if (leftRecent !== rightRecent) return leftRecent - rightRecent
      return left.title.localeCompare(right.title, 'zh-CN')
    }
    return matches
      .sort(order)
      .slice(0, 30)
      .map((note) => ({
        noteId: note.id,
        title: note.title,
        path: note.path,
        recent: recent.has(note.id)
      }))
  }
}

export interface SearchModule extends MainModule {
  service: SearchService
}

export const searchMigrations = [
  {
    id: 'search@1',
    up(db: SqliteDatabase) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS search_docs (
          note_id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          plain_text TEXT NOT NULL
        );
      `)
      try {
        db.exec(
          "CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(note_id UNINDEXED, title, plain_text, tokenize='trigram')"
        )
      } catch {
        // FTS5 is unavailable in this SQLite build; LIKE search remains available.
      }
    }
  }
]

export function createSearchModule(ctx: MainContext): SearchModule {
  const service = new SearchService(ctx)
  return {
    id: 'search',
    migrations: searchMigrations,
    service,
    registerIpc(ipc) {
      ipc.handle(SearchChannels.search, (payload) => {
        if (typeof payload !== 'string') throw new AppError('INVALID_REQUEST')
        return service.search(payload)
      })
      ipc.handle(SearchChannels.quickSwitch, (payload) => {
        if (typeof payload !== 'string') throw new AppError('INVALID_REQUEST')
        return service.quickSwitch(payload)
      })
    }
  }
}
