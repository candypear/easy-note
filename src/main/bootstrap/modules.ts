// 模块组合根：按依赖顺序实例化全部主进程模块并把 service 挂到 ctx.services，返回有序模块列表。
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
  // 装配顺序即依赖顺序：settings/vault 是基础，note/block/link/tag 依赖前者，
  // search/indexer/graph 属于派生数据层放后面；每建好一个立即挂到 ctx.services 供后续模块使用
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
