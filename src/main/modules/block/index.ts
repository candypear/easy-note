import { nanoid } from 'nanoid'
import type { MainContext, MainModule } from '@main/bootstrap/types'
import type { BlockDTO, BlockMentionDTO, BlockRefDTO, BlockType } from '@shared/contracts/block'
import { BlockChannels } from '@shared/contracts/block'
import type { NoteId } from '@shared/types/brand'
import { asBlockId, asNoteId } from '@shared/types/brand'
import { AppError } from '@main/platform/errors'
import { sha256 } from '@main/platform/hash'
import type { ParsedBlock } from '@shared/utils/markdown'
import { normalizeWhitespace } from '@shared/utils/text'
import { escapeLike } from '@main/platform/sql-like'
import type { SqliteDatabase } from '@main/platform/sqlite/connection'

interface BlockRow {
  block_id: string
  note_id: string
  ordinal: number
  type: BlockType
  parent_block_id: string | null
  plain_text: string
  content_markdown: string
  content_hash: string
  start_line: number
  end_line: number
  heading_level: number | null
  code_lang: string | null
  collapsed: number
  valid: number
}

class BlockRepository {
  constructor(private readonly db: SqliteDatabase) {}

  validByNote(noteId: string): BlockRow[] {
    return this.db
      .prepare<BlockRow>('SELECT * FROM blocks WHERE note_id = ? AND valid = 1 ORDER BY ordinal')
      .all(noteId)
  }

  byId(noteId: string, blockId: string): BlockRow | null {
    return (
      this.db
        .prepare<BlockRow>('SELECT * FROM blocks WHERE note_id = ? AND block_id = ?')
        .get(noteId, blockId) ?? null
    )
  }

  byOrdinal(noteId: string, ordinal: number): BlockRow | null {
    return (
      this.db
        .prepare<BlockRow>('SELECT * FROM blocks WHERE note_id = ? AND ordinal = ? AND valid = 1')
        .get(noteId, ordinal) ?? null
    )
  }

  insert(row: BlockRow): void {
    this.db
      .prepare(
        `INSERT INTO blocks (
          block_id, note_id, ordinal, type, parent_block_id, plain_text, content_markdown,
          content_hash, start_line, end_line, heading_level, code_lang, collapsed, valid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.block_id,
        row.note_id,
        row.ordinal,
        row.type,
        row.parent_block_id,
        row.plain_text,
        row.content_markdown,
        row.content_hash,
        row.start_line,
        row.end_line,
        row.heading_level,
        row.code_lang,
        row.collapsed,
        row.valid
      )
  }

  update(row: BlockRow): void {
    this.db
      .prepare(
        `UPDATE blocks SET
          ordinal = ?, type = ?, parent_block_id = ?, plain_text = ?, content_markdown = ?,
          content_hash = ?, start_line = ?, end_line = ?, heading_level = ?, code_lang = ?,
          valid = ?
        WHERE block_id = ?`
      )
      .run(
        row.ordinal,
        row.type,
        row.parent_block_id,
        row.plain_text,
        row.content_markdown,
        row.content_hash,
        row.start_line,
        row.end_line,
        row.heading_level,
        row.code_lang,
        row.valid,
        row.block_id
      )
  }

  invalidate(blockId: string): void {
    this.db.prepare('UPDATE blocks SET valid = 0 WHERE block_id = ?').run(blockId)
  }

  remove(blockId: string): void {
    this.db.prepare('DELETE FROM blocks WHERE block_id = ?').run(blockId)
  }

  removeByNote(noteId: string): void {
    this.db.prepare('DELETE FROM blocks WHERE note_id = ?').run(noteId)
  }

  setCollapsed(blockId: string, collapsed: boolean): void {
    this.db
      .prepare('UPDATE blocks SET collapsed = ? WHERE block_id = ?')
      .run(collapsed ? 1 : 0, blockId)
  }

  searchMentions(text: string, excludeNoteId: string, limit: number): BlockRow[] {
    return this.db
      .prepare<BlockRow>(
        "SELECT * FROM blocks WHERE valid = 1 AND note_id != ? AND plain_text LIKE ? ESCAPE '\\' ORDER BY note_id, ordinal LIMIT ?"
      )
      .all(excludeNoteId, `%${escapeLike(text)}%`, limit)
  }
}

const bigrams = (value: string): Set<string> => {
  const normalized = value.replace(/\s+/g, '')
  const result = new Set<string>()
  if (normalized.length <= 2) {
    if (normalized) result.add(normalized)
    return result
  }
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2))
  }
  return result
}

const similarity = (left: string, right: string): number => {
  if (left === right) return 1
  if (!left || !right) return 0
  const a = bigrams(left)
  const b = bigrams(right)
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection += 1
  return (2 * intersection) / (a.size + b.size)
}

export class BlockService {
  private repository: BlockRepository | null = null

  constructor(private readonly ctx: MainContext) {}

  private repo(): BlockRepository {
    this.repository ??= new BlockRepository(this.ctx.db)
    return this.repository
  }

  sync(noteId: NoteId, parsed: ParsedBlock[]): void {
    const repository = this.repo()
    const old = repository.validByNote(noteId)
    const referenced = this.ctx.services.link.referencedBlockIds(noteId)
    const used = new Set<string>()
    const matches = new Array<BlockRow | null>(parsed.length).fill(null)
    const oldByHash = new Map<string, BlockRow[]>()
    for (const row of old) {
      const list = oldByHash.get(row.content_hash) ?? []
      list.push(row)
      oldByHash.set(row.content_hash, list)
    }

    parsed.forEach((block, index) => {
      const hash = block.plainText ? sha256(normalizeWhitespace(block.plainText)) : ''
      const candidates = (oldByHash.get(hash) ?? [])
        .filter((row) => !used.has(row.block_id))
        .sort((a, b) => {
          const priority = Number(referenced.has(b.block_id)) - Number(referenced.has(a.block_id))
          if (priority !== 0) return priority
          return Math.abs(a.ordinal - index) - Math.abs(b.ordinal - index)
        })
      const exact = candidates[0]
      if (exact) {
        used.add(exact.block_id)
        matches[index] = exact
      }
    })

    parsed.forEach((block, index) => {
      if (matches[index]) return
      const previous = index > 0 ? (matches[index - 1] ?? null) : null
      let best: { row: BlockRow; score: number } | null = null
      for (const row of old) {
        if (used.has(row.block_id) || row.type !== block.type) continue
        const scoreValue = similarity(row.plain_text, block.plainText)
        const neighbor = previous !== null && Math.abs(previous.ordinal - row.ordinal) === 1
        const threshold = neighbor ? 0.35 : 0.5
        if (scoreValue < threshold) continue
        const score = scoreValue + (neighbor ? 0.2 : 0) + (referenced.has(row.block_id) ? 0.15 : 0)
        if (!best || score > best.score) best = { row, score }
      }
      if (best) {
        used.add(best.row.block_id)
        matches[index] = best.row
      }
    })

    this.ctx.db.transaction(() => {
      parsed.forEach((block, index) => {
        const hash = block.plainText ? sha256(normalizeWhitespace(block.plainText)) : ''
        const row = matches[index]
        if (row) {
          repository.update({
            ...row,
            ordinal: index,
            type: block.type,
            plain_text: block.plainText,
            content_markdown: block.markdown,
            content_hash: hash,
            start_line: block.startLine,
            end_line: block.endLine,
            heading_level: block.headingLevel,
            code_lang: block.codeLang,
            valid: 1
          })
          return
        }
        repository.insert({
          block_id: nanoid(12),
          note_id: noteId,
          ordinal: index,
          type: block.type,
          parent_block_id: null,
          plain_text: block.plainText,
          content_markdown: block.markdown,
          content_hash: hash,
          start_line: block.startLine,
          end_line: block.endLine,
          heading_level: block.headingLevel,
          code_lang: block.codeLang,
          collapsed: 0,
          valid: 1
        })
      })
      for (const row of old) {
        if (used.has(row.block_id)) continue
        repository.invalidate(row.block_id)
        if (!referenced.has(row.block_id)) repository.remove(row.block_id)
      }
    })
  }

  listByNote(noteId: NoteId): BlockDTO[] {
    return this.repo()
      .validByNote(noteId)
      .map((row) => this.toDto(row))
  }

  assign(noteId: NoteId, ordinal: number): { blockId: string; ordinal: number } {
    const row = this.repo().byOrdinal(noteId, ordinal)
    if (!row) throw new AppError('BLOCK_NOT_FOUND')
    return { blockId: row.block_id, ordinal: row.ordinal }
  }

  resolve(noteTitle: string, blockId: string): BlockRefDTO | null {
    const note = this.ctx.services.note.requireTitleRow(noteTitle)
    if (!note) return null
    const row = this.repo().byId(note.id, blockId)
    if (!row) return null
    return {
      noteId: asNoteId(note.id),
      noteTitle: note.title,
      notePath: note.path,
      blockId: asBlockId(row.block_id),
      ordinal: row.ordinal,
      markdown: row.content_markdown,
      plainText: row.plain_text,
      valid: row.valid === 1
    }
  }

  setCollapsed(noteId: NoteId, blockId: string, collapsed: boolean): void {
    const note = this.ctx.services.note.getRow(noteId)
    if (!this.repo().byId(note.id, blockId)) throw new AppError('BLOCK_NOT_FOUND')
    this.repo().setCollapsed(blockId, collapsed)
  }

  removeForNote(noteId: NoteId): void {
    this.repo().removeByNote(noteId)
  }

  findBlock(noteId: NoteId, blockId: string): BlockDTO | null {
    const row = this.repo().byId(noteId, blockId)
    return row ? this.toDto(row) : null
  }

  async findMentions(text: string, excludeNoteId: NoteId, limit = 200): Promise<BlockMentionDTO[]> {
    const rows = this.repo().searchMentions(text, excludeNoteId, limit)
    const notes = await this.ctx.services.note.getMany([
      ...new Set(rows.map((row) => asNoteId(row.note_id)))
    ])
    const byId = new Map(notes.map((note) => [note.id, note]))
    const result: BlockMentionDTO[] = []
    for (const row of rows) {
      const note = byId.get(asNoteId(row.note_id))
      if (!note) continue
      result.push({
        blockId: asBlockId(row.block_id),
        noteId: asNoteId(row.note_id),
        noteTitle: note.title,
        notePath: note.path,
        plainText: row.plain_text,
        markdown: row.content_markdown,
        startLine: row.start_line,
        endLine: row.end_line
      })
    }
    return result
  }

  private toDto(row: BlockRow): BlockDTO {
    return {
      id: asBlockId(row.block_id),
      noteId: asNoteId(row.note_id),
      ordinal: row.ordinal,
      type: row.type,
      plainText: row.plain_text,
      markdown: row.content_markdown,
      startLine: row.start_line,
      endLine: row.end_line,
      headingLevel: row.heading_level,
      codeLang: row.code_lang,
      collapsed: row.collapsed === 1,
      valid: row.valid === 1
    }
  }
}

export interface BlockModule extends MainModule {
  service: BlockService
}

export const blockMigrations = [
  {
    id: 'block@1',
    up(db: SqliteDatabase) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS blocks (
          block_id TEXT PRIMARY KEY NOT NULL,
          note_id TEXT NOT NULL,
          ordinal INTEGER NOT NULL,
          type TEXT NOT NULL,
          parent_block_id TEXT,
          plain_text TEXT NOT NULL DEFAULT '',
          content_markdown TEXT NOT NULL DEFAULT '',
          content_hash TEXT NOT NULL DEFAULT '',
          start_line INTEGER NOT NULL DEFAULT 0,
          end_line INTEGER NOT NULL DEFAULT 0,
          heading_level INTEGER,
          code_lang TEXT,
          collapsed INTEGER NOT NULL DEFAULT 0,
          valid INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_blocks_note_ordinal ON blocks(note_id, ordinal);
        CREATE INDEX IF NOT EXISTS idx_blocks_valid ON blocks(note_id, valid);
      `)
    }
  }
]

export function createBlockModule(ctx: MainContext): BlockModule {
  const service = new BlockService(ctx)
  return {
    id: 'block',
    migrations: blockMigrations,
    service,
    registerIpc(ipc) {
      ipc.handle(BlockChannels.listByNote, (payload) => {
        if (typeof payload !== 'string') throw new AppError('INVALID_REQUEST')
        return service.listByNote(asNoteId(payload))
      })
      ipc.handle(BlockChannels.assign, (payload) => {
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('noteId' in payload) ||
          !('ordinal' in payload)
        ) {
          throw new AppError('INVALID_REQUEST')
        }
        return service.assign(asNoteId(String(payload.noteId)), Number(payload.ordinal))
      })
      ipc.handle(BlockChannels.resolve, (payload) => {
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('noteTitle' in payload) ||
          !('blockId' in payload)
        ) {
          throw new AppError('INVALID_REQUEST')
        }
        return service.resolve(String(payload.noteTitle), String(payload.blockId))
      })
      ipc.handle(BlockChannels.setCollapsed, (payload) => {
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('noteId' in payload) ||
          !('blockId' in payload) ||
          !('collapsed' in payload)
        ) {
          throw new AppError('INVALID_REQUEST')
        }
        service.setCollapsed(
          asNoteId(String(payload.noteId)),
          String(payload.blockId),
          Boolean(payload.collapsed)
        )
      })
    }
  }
}
