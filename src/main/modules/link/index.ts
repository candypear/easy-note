import { nanoid } from 'nanoid'
import type { MainContext, MainModule } from '@main/bootstrap/types'
import type { BlockDTO } from '@shared/contracts/block'
import type { BacklinkDTO, UnlinkedMentionDTO } from '@shared/contracts/link'
import { LinkChannels } from '@shared/contracts/link'
import type { NoteSummary } from '@shared/contracts/note'
import type { NoteId } from '@shared/types/brand'
import { asBlockId, asNoteId } from '@shared/types/brand'
import { AppError } from '@main/platform/errors'
import {
  extractWikiLinks,
  findMentionIndex,
  makeContext,
  replaceWikiTargets
} from '@shared/utils/markdown'
import { escapeLike } from '@main/platform/sql-like'
import type { SqliteDatabase } from '@main/platform/sqlite/connection'

interface LinkRow {
  id: string
  source_note_id: string
  source_block_id: string | null
  target_note_id: string | null
  target_block_id: string | null
  link_type: 'wiki' | 'block' | 'embed'
  raw_text: string
  context: string
  resolved: number
}

class LinkRepository {
  constructor(private readonly db: SqliteDatabase) {}

  insert(row: LinkRow): void {
    this.db
      .prepare(
        `INSERT INTO links (
          id, source_note_id, source_block_id, target_note_id, target_block_id,
          link_type, raw_text, context, resolved
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.id,
        row.source_note_id,
        row.source_block_id,
        row.target_note_id,
        row.target_block_id,
        row.link_type,
        row.raw_text,
        row.context,
        row.resolved
      )
  }

  deleteBySource(noteId: string): void {
    this.db.prepare('DELETE FROM links WHERE source_note_id = ?').run(noteId)
  }

  backlinks(noteId: string): LinkRow[] {
    return this.db
      .prepare<LinkRow>('SELECT * FROM links WHERE target_note_id = ? ORDER BY source_note_id, id')
      .all(noteId)
  }

  all(): LinkRow[] {
    return this.db.prepare<LinkRow>('SELECT * FROM links').all()
  }

  sourcesByFragment(fragment: string): string[] {
    return this.db
      .prepare<{ source_note_id: string }>(
        "SELECT DISTINCT source_note_id FROM links WHERE raw_text LIKE ? ESCAPE '\\'"
      )
      .all(`%${escapeLike(fragment)}%`)
      .map((row) => row.source_note_id)
  }

  updateTarget(
    id: string,
    targetNoteId: string | null,
    targetBlockId: string | null,
    resolved: boolean
  ): void {
    this.db
      .prepare('UPDATE links SET target_note_id = ?, target_block_id = ?, resolved = ? WHERE id = ?')
      .run(targetNoteId, targetBlockId, resolved ? 1 : 0, id)
  }

  referencedBlocks(noteId: string): string[] {
    return this.db
      .prepare<{ target_block_id: string }>(
        'SELECT DISTINCT target_block_id FROM links WHERE target_note_id = ? AND target_block_id IS NOT NULL'
      )
      .all(noteId)
      .map((row) => row.target_block_id)
  }

  edges(): { source: string; target: string }[] {
    return this.db
      .prepare<{ source: string; target: string }>(
        'SELECT source_note_id AS source, target_note_id AS target FROM links WHERE resolved = 1 AND target_note_id IS NOT NULL'
      )
      .all()
  }

  removeForNote(noteId: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM links WHERE source_note_id = ?').run(noteId)
      this.db
        .prepare('UPDATE links SET target_note_id = NULL, resolved = 0 WHERE target_note_id = ?')
        .run(noteId)
    })
  }
}

export class LinkService {
  private repository: LinkRepository | null = null

  constructor(private readonly ctx: MainContext) {}

  private repo(): LinkRepository {
    this.repository ??= new LinkRepository(this.ctx.db)
    return this.repository
  }

  sync(noteId: NoteId, blocks: BlockDTO[]): void {
    const repository = this.repo()
    repository.deleteBySource(noteId)
    const rows: LinkRow[] = []
    for (const block of blocks) {
      if (block.type === 'code' || block.type === 'math') continue
      for (const link of extractWikiLinks(block.markdown)) {
        const target = this.ctx.services.note.resolve(link.target)[0] ?? null
        const blockRef = link.blockId
          ? this.ctx.services.block.resolve(link.target, link.blockId)
          : null
        const resolved = Boolean(target) && (!link.blockId || blockRef?.valid === true)
        rows.push({
          id: nanoid(12),
          source_note_id: noteId,
          source_block_id: block.id,
          target_note_id: target?.id ?? null,
          target_block_id: link.blockId,
          link_type: link.embed ? 'embed' : link.blockId ? 'block' : 'wiki',
          raw_text: link.raw,
          context: makeContext(block.plainText || block.markdown, link.target, 40),
          resolved: resolved ? 1 : 0
        })
      }
    }
    this.ctx.db.transaction(() => {
      for (const row of rows) repository.insert(row)
    })
  }

  async backlinks(noteId: NoteId): Promise<BacklinkDTO[]> {
    const rows = this.repo().backlinks(noteId)
    const noteIds = [...new Set(rows.map((row) => asNoteId(row.source_note_id)))]
    const notes = await this.ctx.services.note.getMany(noteIds)
    const byId = new Map(notes.map((note) => [note.id, note]))
    return rows
      .map((row) => {
        const note = byId.get(asNoteId(row.source_note_id))
        if (!note) return null
        return {
          sourceNoteId: asNoteId(row.source_note_id),
          sourceNoteTitle: note.title,
          sourceNotePath: note.path,
          sourceBlockId: row.source_block_id ? asBlockId(row.source_block_id) : null,
          blockRef: row.target_block_id !== null,
          linkType: row.link_type,
          context: row.context
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
  }

  async unlinked(noteId: NoteId): Promise<UnlinkedMentionDTO[]> {
    const note = this.ctx.services.note.getRow(noteId)
    const title = note.title
    if (title.length < 2) return []
    const candidates = await this.ctx.services.block.findMentions(title, noteId, 200)
    const result: UnlinkedMentionDTO[] = []
    for (const candidate of candidates) {
      let occurrence = 0
      while (findMentionIndex(candidate.markdown, title, occurrence) >= 0) {
        result.push({
          sourceNoteId: candidate.noteId,
          sourceNoteTitle: candidate.noteTitle,
          sourceNotePath: candidate.notePath,
          sourceBlockId: candidate.blockId,
          context: makeContext(candidate.plainText, title, 48),
          occurrence
        })
        occurrence += 1
        if (result.length >= 100) break
      }
      if (result.length >= 100) break
    }
    return result
  }

  async convertMention(
    sourceNoteId: NoteId,
    sourceBlockId: string,
    targetTitle: string
  ): Promise<NoteSummary> {
    const note = await this.ctx.services.note.read(sourceNoteId)
    const block = this.ctx.services.block.findBlock(sourceNoteId, sourceBlockId)
    if (!block) throw new AppError('BLOCK_NOT_FOUND')
    const range = this.findMentionRange(note.content, block, targetTitle, 0)
    if (!range) throw new AppError('INVALID_REQUEST', '未找到可转换的提及')
    const updated = `${note.content.slice(0, range.start)}[[${targetTitle}]]${note.content.slice(
      range.end
    )}`
    const saved = await this.ctx.services.note.save(sourceNoteId, updated)
    return saved.meta
  }

  async convertAll(noteId: NoteId): Promise<{ converted: number }> {
    const mentions = await this.unlinked(noteId)
    if (mentions.length === 0) return { converted: 0 }
    const target = this.ctx.services.note.getRow(noteId)
    const grouped = new Map<string, UnlinkedMentionDTO[]>()
    for (const mention of mentions) {
      const list = grouped.get(mention.sourceNoteId) ?? []
      list.push(mention)
      grouped.set(mention.sourceNoteId, list)
    }
    let converted = 0
    for (const [sourceId, items] of grouped) {
      const note = await this.ctx.services.note.read(asNoteId(sourceId))
      const ranges: { start: number; end: number }[] = []
      for (const item of items) {
        const block = this.ctx.services.block.findBlock(asNoteId(sourceId), item.sourceBlockId)
        if (!block) continue
        const range = this.findMentionRange(note.content, block, target.title, item.occurrence)
        if (range) ranges.push(range)
      }
      if (ranges.length === 0) continue
      let content = note.content
      const unique = ranges
        .filter(
          (range, index) =>
            ranges.findIndex((item) => item.start === range.start && item.end === range.end) === index
        )
        .sort((a, b) => b.start - a.start)
      for (const range of unique) {
        content = `${content.slice(0, range.start)}[[${target.title}]]${content.slice(range.end)}`
        converted += 1
      }
      await this.ctx.services.note.save(asNoteId(sourceId), content)
    }
    return { converted }
  }

  async relink(oldTitle: string, newTitle: string): Promise<void> {
    if (oldTitle === newTitle) return
    const sources = this.repo().sourcesByFragment(oldTitle)
    for (const sourceId of sources) {
      const note = await this.ctx.services.note.read(asNoteId(sourceId))
      const updated = replaceWikiTargets(note.content, oldTitle, newTitle)
      if (updated !== note.content) {
        await this.ctx.services.note.save(asNoteId(sourceId), updated)
      }
    }
    this.resolveAll()
  }

  resolveAll(): void {
    const repository = this.repo()
    const rows = repository.all()
    const noteCache = new Map<string, NoteSummary | null>()
    this.ctx.db.transaction(() => {
      for (const row of rows) {
        const link = extractWikiLinks(row.raw_text)[0]
        if (!link) continue
        let target = noteCache.get(link.target)
        if (target === undefined) {
          target = this.ctx.services.note.resolve(link.target)[0] ?? null
          noteCache.set(link.target, target)
        }
        const block =
          target && link.blockId
            ? this.ctx.services.block.resolve(target.title, link.blockId)
            : null
        const resolved = Boolean(target) && (!link.blockId || block?.valid === true)
        repository.updateTarget(row.id, target?.id ?? null, link.blockId, resolved)
      }
    })
  }

  referencedBlockIds(noteId: NoteId): Set<string> {
    return new Set(this.repo().referencedBlocks(noteId))
  }

  removeForNote(noteId: NoteId): void {
    this.repo().removeForNote(noteId)
  }

  edges(): { source: NoteId; target: NoteId }[] {
    const merged = new Map<string, { source: NoteId; target: NoteId }>()
    for (const edge of this.repo().edges()) {
      if (!edge.source || !edge.target) continue
      const key = `${edge.source}->${edge.target}`
      if (!merged.has(key)) {
        merged.set(key, { source: asNoteId(edge.source), target: asNoteId(edge.target) })
      }
    }
    return [...merged.values()]
  }

  resolveTarget(
    title: string
  ): { noteId: NoteId; title: string; path: string; ambiguous: boolean } | null {
    const matches = this.ctx.services.note.resolve(title)
    const first = matches[0]
    if (!first) return null
    return {
      noteId: first.id,
      title: first.title,
      path: first.path,
      ambiguous: matches.length > 1
    }
  }

  private findMentionRange(
    content: string,
    block: BlockDTO,
    targetTitle: string,
    occurrence: number
  ): { start: number; end: number } | null {
    const blockStart = content.indexOf(block.markdown)
    if (blockStart >= 0) {
      const local = findMentionIndex(block.markdown, targetTitle, occurrence)
      if (local < 0) return null
      return {
        start: blockStart + local,
        end: blockStart + local + targetTitle.length
      }
    }
    const lines = content.split(/\r?\n/)
    let offset = 0
    for (let index = 0; index < block.startLine - 1 && index < lines.length; index += 1) {
      offset += (lines[index]?.length ?? 0) + 1
    }
    const segment = lines.slice(block.startLine - 1, block.endLine).join('\n')
    const local = findMentionIndex(segment, targetTitle, occurrence)
    if (local < 0) return null
    return { start: offset + local, end: offset + local + targetTitle.length }
  }
}

export interface LinkModule extends MainModule {
  service: LinkService
}

export const linkMigrations = [
  {
    id: 'link@1',
    up(db: SqliteDatabase) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS links (
          id TEXT PRIMARY KEY NOT NULL,
          source_note_id TEXT NOT NULL,
          source_block_id TEXT,
          target_note_id TEXT,
          target_block_id TEXT,
          link_type TEXT NOT NULL,
          raw_text TEXT NOT NULL,
          context TEXT NOT NULL DEFAULT '',
          resolved INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_links_target_note ON links(target_note_id);
        CREATE INDEX IF NOT EXISTS idx_links_target_block ON links(target_block_id);
        CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_note_id);
      `)
    }
  }
]

export function createLinkModule(ctx: MainContext): LinkModule {
  const service = new LinkService(ctx)
  return {
    id: 'link',
    migrations: linkMigrations,
    service,
    registerIpc(ipc) {
      ipc.handle(LinkChannels.backlinks, (payload) => {
        if (typeof payload !== 'string') throw new AppError('INVALID_REQUEST')
        return service.backlinks(asNoteId(payload))
      })
      ipc.handle(LinkChannels.unlinked, (payload) => {
        if (typeof payload !== 'string') throw new AppError('INVALID_REQUEST')
        return service.unlinked(asNoteId(payload))
      })
      ipc.handle(LinkChannels.convertMention, (payload) => {
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('sourceNoteId' in payload) ||
          !('sourceBlockId' in payload) ||
          !('targetTitle' in payload)
        ) {
          throw new AppError('INVALID_REQUEST')
        }
        return service.convertMention(
          asNoteId(String(payload.sourceNoteId)),
          String(payload.sourceBlockId),
          String(payload.targetTitle)
        )
      })
      ipc.handle(LinkChannels.convertAll, (payload) => {
        if (typeof payload !== 'string') throw new AppError('INVALID_REQUEST')
        return service.convertAll(asNoteId(payload))
      })
      ipc.handle(LinkChannels.resolveTarget, (payload) => {
        if (typeof payload !== 'string') throw new AppError('INVALID_REQUEST')
        return service.resolveTarget(payload)
      })
      ipc.handle(LinkChannels.relink, async (payload) => {
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('oldTitle' in payload) ||
          !('newTitle' in payload)
        ) {
          throw new AppError('INVALID_REQUEST')
        }
        await service.relink(String(payload.oldTitle), String(payload.newTitle))
      })
    }
  }
}
