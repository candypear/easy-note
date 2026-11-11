// 笔记模块桥接：把 NoteApi 调用转发到对应 IPC 通道，单参数直接传值、多参数打包为对象。
import type { NoteApi } from '@shared/contracts/note-api'
import { NoteChannels } from '@shared/contracts/note-api'
import { invoke } from './invoke'

export const noteApi: NoteApi = {
  listAll: () => invoke(NoteChannels.listAll),
  get: (noteId) => invoke(NoteChannels.get, noteId),
  read: (noteId) => invoke(NoteChannels.read, noteId),
  save: (noteId, content) => invoke(NoteChannels.save, { noteId, content }),
  create: (folderPath, title) => invoke(NoteChannels.create, { folderPath, title }),
  rename: (noteId, title) => invoke(NoteChannels.rename, { noteId, title }),
  move: (noteId, folderPath) => invoke(NoteChannels.move, { noteId, folderPath }),
  duplicate: (noteId) => invoke(NoteChannels.duplicate, noteId),
  delete: (noteId) => invoke(NoteChannels.delete, noteId),
  resolve: (title) => invoke(NoteChannels.resolve, title)
}
