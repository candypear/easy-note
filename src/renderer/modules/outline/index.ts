// 大纲模块入口：把 OutlinePanel 注册为右侧面板标签页，排在反链之后（order 20）。
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
