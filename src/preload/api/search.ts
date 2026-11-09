import type { SearchApi } from '@shared/contracts/search'
import { SearchChannels } from '@shared/contracts/search'
import { invoke } from './invoke'

export const searchApi: SearchApi = {
  search: (query) => invoke(SearchChannels.search, query),
  quickSwitch: (query) => invoke(SearchChannels.quickSwitch, query)
}
