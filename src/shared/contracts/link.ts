// 双链模块契约：反向链接、未链接提及及其转链接操作、标题解析与重命名的 IPC 通道/API。
import type { BlockId, NoteId } from '../types/brand'
import type { IpcResult } from './envelope'
import type { NoteSummary } from './note'

export interface LinkTargetDTO {
  noteId: NoteId
  title: string
  path: string
  // 同名笔记多于一个时为 true，渲染端需提示歧义
  ambiguous: boolean
}

export interface BacklinkDTO {
  sourceNoteId: NoteId
  sourceNoteTitle: string
  sourceNotePath: string
  // 链接所在块；笔记级链接时为 null
  sourceBlockId: BlockId | null
  // 是否为块级引用（[[标题#^块ID]]）
  blockRef: boolean
  linkType: 'wiki' | 'block' | 'embed'
  // 链接周围的文本摘录，用于反链面板展示上下文
  context: string
}

// 未链接提及：正文出现了笔记标题但未写成 [[链接]] 的位置
export interface UnlinkedMentionDTO {
  sourceNoteId: NoteId
  sourceNoteTitle: string
  sourceNotePath: string
  sourceBlockId: BlockId
  context: string
  // 标题在该块内第几次出现（0 起），用于精确定位要转换的那一处
  occurrence: number
}

export interface ConvertMentionRequest {
  sourceNoteId: NoteId
  sourceBlockId: BlockId
  targetTitle: string
}

export const LinkChannels = {
  backlinks: 'link:backlinks',
  unlinked: 'link:unlinked',
  convertMention: 'link:convert-mention',
  convertAll: 'link:convert-all',
  resolveTarget: 'link:resolve-target',
  relink: 'link:relink'
} as const

export interface LinkApi {
  backlinks(noteId: NoteId): Promise<IpcResult<BacklinkDTO[]>>
  unlinked(noteId: NoteId): Promise<IpcResult<UnlinkedMentionDTO[]>>
  convertMention(request: ConvertMentionRequest): Promise<IpcResult<NoteSummary>>
  convertAll(noteId: NoteId): Promise<IpcResult<{ converted: number }>>
  resolveTarget(title: string): Promise<IpcResult<LinkTargetDTO | null>>
  // 笔记重命名后批量把旧标题的 wiki 链接改写为新标题
  relink(oldTitle: string, newTitle: string): Promise<IpcResult<void>>
}
