import type { MainContext } from '@main/bootstrap/types'
import type { MainModule } from '@main/bootstrap/types'
import { createBlockModule } from '@main/modules/block'
import { createFolderModule } from '@main/modules/folder'
import { createGraphModule } from '@main/modules/graph'
import { createIndexerModule } from '@main/modules/indexer'
import { createLinkModule } from '@main/modules/link'
import { createNoteModule } from '@main/modules/note'
import { createSearchModule } from '@main/modules/search'
import { createSettingsModule } from '@main/modules/settings'
import { createTagModule } from '@main/modules/tag'
import { createVaultModule } from '@main/modules/vault'
import { createWindowModule } from '@main/modules/window'

export function createModules(ctx: MainContext): MainModule[] {
  const settings = createSettingsModule(ctx)
  ctx.services.settings = settings.service
  const vault = createVaultModule(ctx)
  ctx.services.vault = vault.service
  const folder = createFolderModule(ctx)
  ctx.services.folder = folder.service
  const note = createNoteModule(ctx)
  ctx.services.note = note.service
  const block = createBlockModule(ctx)
  ctx.services.block = block.service
  const link = createLinkModule(ctx)
  ctx.services.link = link.service
  const tag = createTagModule(ctx)
  ctx.services.tag = tag.service
  const search = createSearchModule(ctx)
  ctx.services.search = search.service
  const indexer = createIndexerModule(ctx)
  ctx.services.indexer = indexer.service
  const graph = createGraphModule(ctx)
  ctx.services.graph = graph.service
  const window = createWindowModule(ctx)
  ctx.services.window = window.service
  return [
    settings,
    vault,
    folder,
    note,
    block,
    link,
    tag,
    search,
    indexer,
    graph,
    window
  ]
}
