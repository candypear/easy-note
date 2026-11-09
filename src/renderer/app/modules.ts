import type { RendererModule } from './context'
import { shellModule } from '../modules/shell'
import { explorerModule } from '../modules/explorer'
import { editorModule } from '../modules/editor'
import { tagsModule } from '../modules/tags'
import { searchModule } from '../modules/search'
import { backlinksModule } from '../modules/backlinks'
import { outlineModule } from '../modules/outline'
import { graphModule } from '../modules/graph'
import { settingsModule } from '../modules/settings'
import { quickSwitchModule } from '../modules/quick-switch'

export const rendererModules: RendererModule[] = [
  shellModule,
  explorerModule,
  editorModule,
  tagsModule,
  searchModule,
  backlinksModule,
  outlineModule,
  graphModule,
  settingsModule,
  quickSwitchModule
]
