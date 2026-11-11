// 笔记模块的 IPC 通道与 API 契约（DTO 定义见 note.ts）。
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
  // 保存后完成索引的时间（ISO），渲染端用于展示同步状态
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
  // 删除进回收站而非物理删除
  delete(noteId: NoteId): Promise<IpcResult<void>>
  // 按标题查笔记，可能命中多个同名笔记
  resolve(title: string): Promise<IpcResult<NoteSummary[]>>
}
