// 标签模块入口：把 TagsView 注册为侧栏视图，提供标签聚合列表与多标签筛选。
import type { RendererModule } from '../../app/context'
import TagsView from './components/TagsView.vue'

export const tagsModule: RendererModule = {
  id: 'tags',
  install(_app, ctx) {
    ctx.shell.registry.sidebar.registerView({
      id: 'tags',
      titleKey: 'sidebar.tags',
      icon: 'tag',
      order: 20,
      component: TagsView
    })
  }
}
