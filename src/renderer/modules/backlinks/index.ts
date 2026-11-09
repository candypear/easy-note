import type { RendererModule } from '../../app/context'
import BacklinksPanel from './components/BacklinksPanel.vue'

export const backlinksModule: RendererModule = {
  id: 'backlinks',
  install(_app, ctx) {
    ctx.shell.registry.rightPanel.registerTab({
      id: 'backlinks',
      titleKey: 'backlinks.title',
      order: 10,
      component: BacklinksPanel
    })
  }
}
