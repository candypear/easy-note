import type { BlockService } from '@main/modules/block'
import type { FolderService } from '@main/modules/folder'
import type { GraphService } from '@main/modules/graph'
import type { IndexerService } from '@main/modules/indexer'
import type { LinkService } from '@main/modules/link'
import type { NoteService } from '@main/modules/note'
import type { SearchService } from '@main/modules/search'
import type { SettingsService } from '@main/modules/settings'
import type { TagService } from '@main/modules/tag'
import type { VaultService } from '@main/modules/vault'
import type { WindowService } from '@main/modules/window'

export interface MainServices {
  settings: SettingsService
  vault: VaultService
  folder: FolderService
  note: NoteService
  block: BlockService
  link: LinkService
  tag: TagService
  search: SearchService
  indexer: IndexerService
  graph: GraphService
  window: WindowService
}

export type { BlockService, FolderService, GraphService, IndexerService, LinkService, NoteService, SearchService, SettingsService, TagService, VaultService, WindowService }
