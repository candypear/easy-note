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
