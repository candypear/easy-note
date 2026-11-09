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
