import type { RendererContext, RendererModule } from '../../app/context'
import { useTheme } from './composables/useTheme'

export const shellModule: RendererModule = {
  id: 'shell',
  install(_app, ctx: RendererContext) {
    const stops: (() => void)[] = [useTheme(ctx)]
    let progressTimer: ReturnType<typeof setTimeout> | null = null

    void Promise.all([ctx.api.settings.get(), ctx.api.vault.current()]).then(
      ([settings, vault]) => {
        if (settings.ok) {
          const value = settings.data
          ctx.shell.state.sidebarWidth = value.sidebarWidth
          ctx.shell.state.rightWidth = value.rightWidth
          ctx.shell.state.sidebarOpen = value.sidebarOpen
          ctx.shell.state.rightOpen = value.rightOpen
          ctx.shell.state.themeMode = value.theme
          ctx.shell.state.fontSize = value.fontSize
          ctx.shell.state.vaultPath = value.vaultPath
          if (value.vaultPath) {
            ctx.shell.state.vaultName = value.vaultPath.split(/[\\/]/).filter(Boolean).pop() ?? 'EasyNote'
          }
        }
        if (vault.ok && vault.data) {
          ctx.shell.state.vaultOpen = true
          ctx.shell.state.vaultPath = vault.data.path
          ctx.shell.state.vaultName = vault.data.name
        }
        ctx.shell.state.booted = true
      }
    )

    stops.push(
      ctx.events.on('vault:changed', ({ path }) => {
        ctx.shell.state.vaultOpen = true
        ctx.shell.state.vaultPath = path
        ctx.shell.state.vaultName = path ? path.split(/[\\/]/).filter(Boolean).pop() ?? 'EasyNote' : 'EasyNote'
      })
    )

    stops.push(
      ctx.events.on('settings:changed', ({ settings }) => {
        ctx.shell.state.themeMode = settings.theme
        ctx.shell.state.fontSize = settings.fontSize
      })
    )

    stops.push(
      ctx.events.on('index:progress', ({ phase, current, total }) => {
        if (progressTimer) {
          clearTimeout(progressTimer)
          progressTimer = null
        }
        ctx.shell.state.indexProgress = total > 0 ? (current / total) * 100 : null
        if (phase === 'done') {
          ctx.shell.state.indexProgress = 100
          progressTimer = setTimeout(() => {
            ctx.shell.state.indexProgress = null
          }, 600)
        }
      })
    )

    void ctx.api.window.platform().then((result) => {
      if (result.ok) ctx.shell.state.platform = result.data
    })

    this.dispose = () => {
      for (const stop of stops) stop()
      if (progressTimer) clearTimeout(progressTimer)
    }
  }
}
