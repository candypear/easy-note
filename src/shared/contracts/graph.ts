import type { NoteId } from '../types/brand'
import type { IpcResult } from './envelope'

export interface GraphNodeDTO {
  id: NoteId
  title: string
  path: string
  degree: number
  folderPath: string
}

export interface GraphEdgeDTO {
  source: NoteId
  target: NoteId
  weight: number
}

export interface GraphDataDTO {
  nodes: GraphNodeDTO[]
  edges: GraphEdgeDTO[]
  truncated: boolean
}

export const GraphChannels = {
  global: 'graph:global',
  local: 'graph:local'
} as const

export interface GraphApi {
  global(): Promise<IpcResult<GraphDataDTO>>
  local(noteId: NoteId, depth: number): Promise<IpcResult<GraphDataDTO>>
}
