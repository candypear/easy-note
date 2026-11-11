// 设置模块入口：把 SettingsDialog 注册为全局浮层（overlay），按需以模态框打开。
import type { RendererModule } from '../../app/context'
import SettingsDialog from './components/SettingsDialog.vue'

export const settingsModule: RendererModule = {
  id: 'settings',
  install(_app, ctx) {
    ctx.shell.registry.overlay.register('settings', SettingsDialog)
  }
}
