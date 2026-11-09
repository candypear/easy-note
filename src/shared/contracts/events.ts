import type { NoteId } from '../types/brand'
import type { SettingsDTO } from './settings'

export interface EasyNoteEventMap {
  'vault:changed': { vaultId: string | null; path: string | null }
  'folder:changed': { folderId: string | null }
  'note:created': { noteId: NoteId }
  'note:renamed': { noteId: NoteId; oldTitle: string; newTitle: string }
  'note:deleted': { noteId: NoteId }
  'note:saved': { noteId: NoteId }
  'note:external-change': { noteId: NoteId; diskHash: string }
  'index:progress': { phase: string; current: number; total: number }
  'index:updated': { noteIds: NoteId[] }
  'window:maximized-changed': boolean
  'theme:changed': { theme: 'light' | 'dark' }
  'settings:changed': { keys: (keyof SettingsDTO)[]; settings: SettingsDTO }
}

export type EventName = keyof EasyNoteEventMap

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
  on<K extends EventName>(event: K, listener: (payload: EasyNoteEventMap[K]) => void): () => void
}
