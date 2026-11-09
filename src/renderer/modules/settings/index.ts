import type { RendererModule } from '../../app/context'
import SettingsDialog from './components/SettingsDialog.vue'

export const settingsModule: RendererModule = {
  id: 'settings',
  install(_app, ctx) {
    ctx.shell.registry.overlay.register('settings', SettingsDialog)
  }
}
