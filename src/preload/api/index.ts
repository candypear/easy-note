// 汇总各模块桥接实现为 EasyNoteApi；显式标注类型确保实现与 shared 契约一致。
import type { EasyNoteApi } from '@shared/contracts/api'
import { blockApi } from './block'
import { eventsApi } from './events'
import { folderApi } from './folder'
import { graphApi } from './graph'
import { linkApi } from './link'
import { noteApi } from './note'
import { searchApi } from './search'
import { settingsApi } from './settings'
import { tagApi } from './tag'
import { vaultApi } from './vault'
import { windowApi } from './window'

export const api: EasyNoteApi = {
  vault: vaultApi,
  folder: folderApi,
  note: noteApi,
  block: blockApi,
  link: linkApi,
  tag: tagApi,
  search: searchApi,
  graph: graphApi,
  settings: settingsApi,
  window: windowApi,
  events: eventsApi
}
