import type { BlockApi } from '@shared/contracts/block'
import { BlockChannels } from '@shared/contracts/block'
import { invoke } from './invoke'

export const blockApi: BlockApi = {
  listByNote: (noteId) => invoke(BlockChannels.listByNote, noteId),
  assign: (noteId, ordinal) => invoke(BlockChannels.assign, { noteId, ordinal }),
  resolve: (noteTitle, blockId) => invoke(BlockChannels.resolve, { noteTitle, blockId }),
  setCollapsed: (noteId, blockId, collapsed) =>
    invoke(BlockChannels.setCollapsed, { noteId, blockId, collapsed })
}
