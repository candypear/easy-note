import type { BlockId, NoteId } from '../types/brand'
import type { IpcResult } from './envelope'
import type { NoteSummary } from './note'

export interface LinkTargetDTO {
  noteId: NoteId
  title: string
  path: string
  ambiguous: boolean
}

export interface BacklinkDTO {
  sourceNoteId: NoteId
  sourceNoteTitle: string
  sourceNotePath: string
  sourceBlockId: BlockId | null
  blockRef: boolean
  linkType: 'wiki' | 'block' | 'embed'
  context: string
}

export interface UnlinkedMentionDTO {
  sourceNoteId: NoteId
  sourceNoteTitle: string
  sourceNotePath: string
  sourceBlockId: BlockId
  context: string
  occurrence: number
}

export interface ConvertMentionRequest {
  sourceNoteId: NoteId
  sourceBlockId: BlockId
  targetTitle: string
}

export const LinkChannels = {
  backlinks: 'link:backlinks',
  unlinked: 'link:unlinked',
  convertMention: 'link:convert-mention',
  convertAll: 'link:convert-all',
  resolveTarget: 'link:resolve-target',
  relink: 'link:relink'
} as const

export interface LinkApi {
  backlinks(noteId: NoteId): Promise<IpcResult<BacklinkDTO[]>>
  unlinked(noteId: NoteId): Promise<IpcResult<UnlinkedMentionDTO[]>>
  convertMention(request: ConvertMentionRequest): Promise<IpcResult<NoteSummary>>
  convertAll(noteId: NoteId): Promise<IpcResult<{ converted: number }>>
  resolveTarget(title: string): Promise<IpcResult<LinkTargetDTO | null>>
  relink(oldTitle: string, newTitle: string): Promise<IpcResult<void>>
}
