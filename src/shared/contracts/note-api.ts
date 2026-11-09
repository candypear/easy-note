import type { NoteId } from '../types/brand'
import type { IpcResult } from './envelope'
import type { NoteContent, NoteSummary } from './note'

export const NoteChannels = {
  listAll: 'note:list-all',
  get: 'note:get',
  read: 'note:read',
  save: 'note:save',
  create: 'note:create',
  rename: 'note:rename',
  move: 'note:move',
  duplicate: 'note:duplicate',
  delete: 'note:delete',
  resolve: 'note:resolve'
} as const

export interface NoteSaveResult {
  meta: NoteSummary
  indexedAt: string
}

export interface NoteApi {
  listAll(): Promise<IpcResult<NoteSummary[]>>
  get(noteId: NoteId): Promise<IpcResult<NoteSummary>>
  read(noteId: NoteId): Promise<IpcResult<NoteContent>>
  save(noteId: NoteId, content: string): Promise<IpcResult<NoteSaveResult>>
  create(folderPath: string | null, title?: string): Promise<IpcResult<NoteSummary>>
  rename(noteId: NoteId, title: string): Promise<IpcResult<NoteSummary>>
  move(noteId: NoteId, folderPath: string | null): Promise<IpcResult<NoteSummary>>
  duplicate(noteId: NoteId): Promise<IpcResult<NoteSummary>>
  delete(noteId: NoteId): Promise<IpcResult<void>>
  resolve(title: string): Promise<IpcResult<NoteSummary[]>>
}
