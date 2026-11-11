// 关系图谱契约：全局/局部图的节点、边 DTO 与 IPC 通道/API 定义。
import type { NoteId } from '../types/brand'
import type { IpcResult } from './envelope'

export interface GraphNodeDTO {
  id: NoteId
  title: string
  path: string
  // 连接度（入链+出链数），用于节点大小渲染
  degree: number
  folderPath: string
}

export interface GraphEdgeDTO {
  source: NoteId
  target: NoteId
  // 两笔记间链接次数，用于边粗细渲染
  weight: number
}

export interface GraphDataDTO {
  nodes: GraphNodeDTO[]
  edges: GraphEdgeDTO[]
  // 超出规模上限被截断时为 true，渲染端应提示图不完整
  truncated: boolean
}

export const GraphChannels = {
  global: 'graph:global',
  local: 'graph:local'
} as const

export interface GraphApi {
  global(): Promise<IpcResult<GraphDataDTO>>
  // 以某笔记为中心、按跳数 depth 取局部子图
  local(noteId: NoteId, depth: number): Promise<IpcResult<GraphDataDTO>>
}
