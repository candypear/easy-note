import type { TagId } from '../types/brand'
import type { IpcResult } from './envelope'
import type { NoteSummary } from './note'

export type TagFilterMode = 'and' | 'or'

export interface TagDTO {
  id: TagId
  name: string
  count: number
}

export interface TagFilterResult {
  notes: NoteSummary[]
}

export const TagChannels = {
  list: 'tag:list',
  filter: 'tag:filter',
  rename: 'tag:rename',
  delete: 'tag:delete'
} as const

export interface TagApi {
  list(): Promise<IpcResult<TagDTO[]>>
  filter(names: string[], mode: TagFilterMode): Promise<IpcResult<TagFilterResult>>
  rename(oldName: string, newName: string): Promise<IpcResult<TagDTO>>
  delete(name: string): Promise<IpcResult<void>>
}
