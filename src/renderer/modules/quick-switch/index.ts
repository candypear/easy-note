// 快速切换模块入口：注册笔记切换浮层与 Ctrl+K 快捷键（未打开 vault 时不响应）。
import type { RendererModule } from '../../app/context'
import QuickSwitch from './components/QuickSwitch.vue'

export const quickSwitchModule: RendererModule = {
  id: 'quick-switch',
  install(_app, ctx) {
    ctx.shell.registry.overlay.register('quick-switch', QuickSwitch)
    ctx.shortcuts.register('Ctrl+K', (event) => {
      if (!ctx.shell.state.vaultOpen) return
      event.preventDefault()
      ctx.shell.openOverlay('quick-switch')
    })
  }
}
