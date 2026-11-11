// 标签模块桥接：把 TagApi 调用转发到对应 IPC 通道。
import type { TagApi } from '@shared/contracts/tag'
import { TagChannels } from '@shared/contracts/tag'
import { invoke } from './invoke'

export const tagApi: TagApi = {
  list: () => invoke(TagChannels.list),
  filter: (names, mode) => invoke(TagChannels.filter, { names, mode }),
  rename: (oldName, newName) => invoke(TagChannels.rename, { oldName, newName }),
  delete: (name) => invoke(TagChannels.delete, name)
}
