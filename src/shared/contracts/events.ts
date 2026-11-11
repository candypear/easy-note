// 主进程 → 渲染进程的推送事件契约：事件名到 payload 的类型映射与订阅 API。
import type { NoteId } from '../types/brand'
import type { SettingsDTO } from './settings'

export interface EasyNoteEventMap {
  'vault:changed': { vaultId: string | null; path: string | null }
  'folder:changed': { folderId: string | null }
  'note:created': { noteId: NoteId }
  'note:renamed': { noteId: NoteId; oldTitle: string; newTitle: string }
  'note:deleted': { noteId: NoteId }
  'note:saved': { noteId: NoteId }
  // 磁盘文件被外部程序修改；diskHash 供渲染端判断是否与当前编辑内容冲突
  'note:external-change': { noteId: NoteId; diskHash: string }
  'index:progress': { phase: string; current: number; total: number }
  'index:updated': { noteIds: NoteId[] }
  'window:maximized-changed': boolean
  'theme:changed': { theme: 'light' | 'dark' }
  'settings:changed': { keys: (keyof SettingsDTO)[]; settings: SettingsDTO }
}

export type EventName = keyof EasyNoteEventMap

// 运行时白名单：preload 据此校验订阅的事件名，防止渲染端监听任意 IPC 通道
export const EVENT_NAMES: EventName[] = [
  'vault:changed',
  'folder:changed',
  'note:created',
  'note:renamed',
  'note:deleted',
  'note:saved',
  'note:external-change',
  'index:progress',
  'index:updated',
  'window:maximized-changed',
  'theme:changed',
  'settings:changed'
]

export interface EventsApi {
  // 返回值是取消订阅函数，调用方（组件卸载时）必须调用它移除监听，避免泄漏
  on<K extends EventName>(event: K, listener: (payload: EasyNoteEventMap[K]) => void): () => void
}
