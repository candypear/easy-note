// 笔记领域 DTO：列表/元信息用 NoteSummary，读取全文用 NoteContent。
import type { NoteId } from '../types/brand'

export interface NoteSummary {
  id: NoteId
  title: string
  path: string
  folderPath: string
  // 文件修改时间（ISO 字符串，便于跨进程序列化）
  modifiedAt: string
}

export interface NoteContent extends NoteSummary {
  content: string
}
