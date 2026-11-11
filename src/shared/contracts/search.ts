// 搜索模块契约：全文搜索与快速切换（quick switch）的命中结果与 IPC 通道/API。
import type { BlockId, NoteId } from '../types/brand'
import type { IpcResult } from './envelope'

export interface SearchHit {
  noteId: NoteId
  // 命中所在块；仅命中标题时为 null
  blockId: BlockId | null
  title: string
  path: string
  // 带命中位置的文本摘录
  snippet: string
  modifiedAt: string
  // 相关度得分，越大越靠前
  score: number
}

export interface QuickSwitchHit {
  noteId: NoteId
  title: string
  path: string
  // 是否属于最近打开的笔记（空查询时优先展示）
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
