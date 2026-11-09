import type { RendererModule } from '../../app/context'
import OutlinePanel from './components/OutlinePanel.vue'

export const outlineModule: RendererModule = {
  id: 'outline',
  install(_app, ctx) {
    ctx.shell.registry.rightPanel.registerTab({
      id: 'outline',
      titleKey: 'outline.title',
      order: 20,
      component: OutlinePanel
    })
  }
}
