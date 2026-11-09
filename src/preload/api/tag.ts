import type { TagApi } from '@shared/contracts/tag'
import { TagChannels } from '@shared/contracts/tag'
import { invoke } from './invoke'

export const tagApi: TagApi = {
  list: () => invoke(TagChannels.list),
  filter: (names, mode) => invoke(TagChannels.filter, { names, mode }),
  rename: (oldName, newName) => invoke(TagChannels.rename, { oldName, newName }),
  delete: (name) => invoke(TagChannels.delete, name)
}
