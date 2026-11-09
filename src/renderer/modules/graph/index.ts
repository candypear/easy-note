import type { RendererModule } from '../../app/context'
import GraphView from './components/GraphView.vue'

export const graphModule: RendererModule = {
  id: 'graph',
  install(_app, ctx) {
    ctx.shell.registry.workspace.registerView({
      id: 'graph',
      order: 20,
      component: GraphView
    })
  }
}
