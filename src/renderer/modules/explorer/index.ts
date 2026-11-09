import type { RendererModule } from '../../app/context'
import FileTree from './components/FileTree.vue'

export const explorerModule: RendererModule = {
  id: 'explorer',
  install(_app, ctx) {
    ctx.shell.registry.sidebar.registerView({
      id: 'explorer',
      titleKey: 'sidebar.files',
      icon: 'folder',
      order: 10,
      component: FileTree
    })
  }
}
