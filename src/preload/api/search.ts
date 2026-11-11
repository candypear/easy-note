// 搜索模块桥接：把 SearchApi 调用转发到对应 IPC 通道。
import type { SearchApi } from '@shared/contracts/search'
import { SearchChannels } from '@shared/contracts/search'
import { invoke } from './invoke'

export const searchApi: SearchApi = {
  search: (query) => invoke(SearchChannels.search, query),
  quickSwitch: (query) => invoke(SearchChannels.quickSwitch, query)
}
