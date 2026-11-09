import { watch } from 'vue'
import type { RendererContext } from '../../../app/context'

export function useTheme(ctx: RendererContext): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')

  const apply = (): void => {
    const mode = ctx.shell.state.themeMode
    const resolved = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode
    ctx.shell.state.resolvedTheme = resolved
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.setProperty('--font-size-body', `${ctx.shell.state.fontSize}px`)
  }

  const stop = watch(
    () => [ctx.shell.state.themeMode, ctx.shell.state.fontSize],
    apply,
    { immediate: true }
  )
  const onMedia = (): void => {
    if (ctx.shell.state.themeMode === 'system') apply()
  }
  media.addEventListener('change', onMedia)
  const offTheme = ctx.events.on('theme:changed', () => {
    if (ctx.shell.state.themeMode === 'system') apply()
  })
  const offSettings = ctx.events.on('settings:changed', (payload) => {
    ctx.shell.state.themeMode = payload.settings.theme
    ctx.shell.state.fontSize = payload.settings.fontSize
  })

  return () => {
    stop()
    media.removeEventListener('change', onMedia)
    offTheme()
    offSettings()
  }
}
