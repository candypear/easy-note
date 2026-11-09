import type { GraphApi } from '@shared/contracts/graph'
import { GraphChannels } from '@shared/contracts/graph'
import { invoke } from './invoke'

export const graphApi: GraphApi = {
  global: () => invoke(GraphChannels.global),
  local: (noteId, depth) => invoke(GraphChannels.local, { noteId, depth })
}
