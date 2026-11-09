import type { BlockId, NoteId } from '../types/brand'
import type { IpcResult } from './envelope'

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'task'
  | 'quote'
  | 'code'
  | 'math'
  | 'table'
  | 'hr'

export interface BlockDTO {
  id: BlockId
  noteId: NoteId
  ordinal: number
  type: BlockType
  plainText: string
  markdown: string
  startLine: number
  endLine: number
  headingLevel: number | null
  codeLang: string | null
  collapsed: boolean
  valid: boolean
}

export interface BlockRefDTO {
  noteId: NoteId
  noteTitle: string
  notePath: string
  blockId: BlockId
  ordinal: number
  markdown: string
  plainText: string
  valid: boolean
}

export interface BlockAssignResult {
  blockId: BlockId
  ordinal: number
}

export interface BlockMentionDTO {
  blockId: BlockId
  noteId: NoteId
  noteTitle: string
  notePath: string
  plainText: string
  markdown: string
  startLine: number
  endLine: number
}

export const BlockChannels = {
  listByNote: 'block:list-by-note',
  assign: 'block:assign',
  resolve: 'block:resolve',
  setCollapsed: 'block:set-collapsed'
} as const

export interface BlockApi {
  listByNote(noteId: NoteId): Promise<IpcResult<BlockDTO[]>>
  assign(noteId: NoteId, ordinal: number): Promise<IpcResult<BlockAssignResult>>
  resolve(noteTitle: string, blockId: string): Promise<IpcResult<BlockRefDTO | null>>
  setCollapsed(noteId: NoteId, blockId: BlockId, collapsed: boolean): Promise<IpcResult<void>>
}
