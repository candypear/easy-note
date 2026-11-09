import type { BlockId, NoteId } from '../types/brand'
import type { IpcResult } from './envelope'

export interface SearchHit {
  noteId: NoteId
  blockId: BlockId | null
  title: string
  path: string
  snippet: string
  modifiedAt: string
  score: number
}

export interface QuickSwitchHit {
  noteId: NoteId
  title: string
  path: string
  recent: boolean
}

export const SearchChannels = {
  search: 'search:search',
  quickSwitch: 'search:quick-switch'
} as const

export interface SearchApi {
  search(query: string): Promise<IpcResult<SearchHit[]>>
  quickSwitch(query: string): Promise<IpcResult<QuickSwitchHit[]>>
}
