// explorer 模块装配：仅向外壳侧栏注册"文件"视图（FileTree），
// 树的状态与交互逻辑由组件内部按需创建，不在 install 期加载数据。
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
