// 标签模块契约：标签 DTO、多标签筛选与重命名/删除的 IPC 通道/API。
import type { TagId } from '../types/brand'
import type { IpcResult } from './envelope'
import type { NoteSummary } from './note'

// 多标签筛选逻辑：and 要求全部命中，or 命中任一即可
export type TagFilterMode = 'and' | 'or'

export interface TagDTO {
  id: TagId
  name: string
  // 引用该标签的笔记数
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
  // 重命名会同步改写所有笔记正文与 frontmatter 中的标签
  rename(oldName: string, newName: string): Promise<IpcResult<TagDTO>>
  // 删除即从所有笔记中移除该标签
  delete(name: string): Promise<IpcResult<void>>
}
