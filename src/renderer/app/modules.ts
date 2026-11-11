// 渲染模块注册清单：main.ts 按数组顺序依次 install。
// shell 必须排首位（提供外壳状态与注册表），其余模块向其注册视图/快捷键。
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
