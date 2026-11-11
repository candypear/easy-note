// 图谱模块桥接：把 GraphApi 调用转发到对应 IPC 通道。
import type { GraphApi } from '@shared/contracts/graph'
import { GraphChannels } from '@shared/contracts/graph'
import { invoke } from './invoke'

export const graphApi: GraphApi = {
  global: () => invoke(GraphChannels.global),
  local: (noteId, depth) => invoke(GraphChannels.local, { noteId, depth })
}
