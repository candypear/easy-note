import type { BlockApi } from './block'
import type { EventsApi } from './events'
import type { FolderApi } from './folder'
import type { GraphApi } from './graph'
import type { LinkApi } from './link'
import type { NoteApi } from './note-api'
import type { SearchApi } from './search'
import type { SettingsApi } from './settings'
import type { TagApi } from './tag'
import type { VaultApi } from './vault'
import type { WindowApi } from './window'

export interface EasyNoteApi {
  vault: VaultApi
  folder: FolderApi
  note: NoteApi
  block: BlockApi
  link: LinkApi
  tag: TagApi
  search: SearchApi
  graph: GraphApi
  settings: SettingsApi
  window: WindowApi
  events: EventsApi
}
