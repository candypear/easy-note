// 主题同步：把 themeMode（light/dark/system）解析为实际主题写到 <html data-theme>，
// system 模式下同时监听系统与主进程 nativeTheme 的变化，返回统一的清理函数。
import { watch } from 'vue'
import type { RendererContext } from '../../../app/context'

export function useTheme(ctx: RendererContext): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')

  const apply = (): void => {
    const mode = ctx.shell.state.themeMode
    // system 模式按系统偏好解析；data-theme 驱动 CSS 变量切换，
    // 字号也在此写入 CSS 变量，与主题共用一条应用路径
    const resolved = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode
    ctx.shell.state.resolvedTheme = resolved
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.setProperty('--font-size-body', `${ctx.shell.state.fontSize}px`)
  }

  // immediate 保证启动即应用一次，避免首帧无主题
  const stop = watch(
    () => [ctx.shell.state.themeMode, ctx.shell.state.fontSize],
    apply,
    { immediate: true }
  )
  // 仅 system 模式需要跟随系统偏好变化；手动模式不受系统切换影响
  const onMedia = (): void => {
    if (ctx.shell.state.themeMode === 'system') apply()
  }
  media.addEventListener('change', onMedia)
  // 主进程 nativeTheme 变化事件：与 matchMedia 双保险，覆盖媒体查询不触发的场景
  const offTheme = ctx.events.on('theme:changed', () => {
    if (ctx.shell.state.themeMode === 'system') apply()
  })
  // 设置保存后经主进程广播回来，回填状态触发上面的 watch 重新应用
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
