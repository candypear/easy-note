// 块模块契约：块 DTO、块引用解析结果与 IPC 通道/API 定义。
import type { BlockId, NoteId } from '../types/brand'
import type { IpcResult } from './envelope'

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'task'
  | 'quote'
  | 'code'
  | 'math'
  | 'table'
  | 'hr'

export interface BlockDTO {
  id: BlockId
  noteId: NoteId
  // 块在笔记内的序号（从 0 起），用于定位与排序
  ordinal: number
  type: BlockType
  plainText: string
  markdown: string
  // 块在文件中的行号范围（1 起，含首尾），用于跳转与外部变更定位
  startLine: number
  endLine: number
  headingLevel: number | null
  codeLang: string | null
  collapsed: boolean
  // 块 ID 是否仍有效（内容重写后旧 ID 可能失效）
  valid: boolean
}

// 跨笔记块引用（[[标题#^块ID]]）的解析结果，附带来源笔记信息便于展示
export interface BlockRefDTO {
  noteId: NoteId
  noteTitle: string
  notePath: string
  blockId: BlockId
  ordinal: number
  markdown: string
  plainText: string
  valid: boolean
}

// 为指定序号的块分配持久 ID 后的返回值
export interface BlockAssignResult {
  blockId: BlockId
  ordinal: number
}

// 编辑器块引用候选项（@ 提及块时的搜索结果）
export interface BlockMentionDTO {
  blockId: BlockId
  noteId: NoteId
  noteTitle: string
  notePath: string
  plainText: string
  markdown: string
  startLine: number
  endLine: number
}

export const BlockChannels = {
  listByNote: 'block:list-by-note',
  assign: 'block:assign',
  resolve: 'block:resolve',
  setCollapsed: 'block:set-collapsed'
} as const

export interface BlockApi {
  listByNote(noteId: NoteId): Promise<IpcResult<BlockDTO[]>>
  assign(noteId: NoteId, ordinal: number): Promise<IpcResult<BlockAssignResult>>
  // 目标不存在时 data 为 null，而非报错
  resolve(noteTitle: string, blockId: string): Promise<IpcResult<BlockRefDTO | null>>
  setCollapsed(noteId: NoteId, blockId: BlockId, collapsed: boolean): Promise<IpcResult<void>>
}
