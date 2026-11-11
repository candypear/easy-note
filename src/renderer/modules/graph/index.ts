// 图谱模块入口：把 GraphView 注册为工作区视图（与编辑器互斥切换，而非侧栏面板）。
import type { RendererModule } from '../../app/context'
import GraphView from './components/GraphView.vue'

export const graphModule: RendererModule = {
  id: 'graph',
  install(_app, ctx) {
    // order 决定工作区视图的排序，图谱排在编辑器之后
    ctx.shell.registry.workspace.registerView({
      id: 'graph',
      order: 20,
      component: GraphView
    })
  }
}
