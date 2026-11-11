// shell 模块装配：启动时拉取设置与当前笔记库回填外壳状态，
// 订阅库切换/设置变更/索引进度事件，并挂接主题同步；dispose 统一释放。
import type { RendererContext, RendererModule } from '../../app/context'
import { useTheme } from './composables/useTheme'

export const shellModule: RendererModule = {
  id: 'shell',
  install(_app, ctx: RendererContext) {
    // 收集所有反注册/停止函数，dispose 时逐一调用防止泄漏
    const stops: (() => void)[] = [useTheme(ctx)]
    let progressTimer: ReturnType<typeof setTimeout> | null = null

    // 并行读取设置与当前库；全部回填后才置 booted，
    // AppShell 在此之前渲染空白占位，避免布局参数闪变
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
          // 主进程返回的当前库信息比设置里的路径更权威，覆盖之
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
        // 新进度到达先撤销上一轮的"完成后隐藏"定时器，避免进度条被提前清掉
        if (progressTimer) {
          clearTimeout(progressTimer)
          progressTimer = null
        }
        ctx.shell.state.indexProgress = total > 0 ? (current / total) * 100 : null
        if (phase === 'done') {
          // 完成后短暂停留在 100% 再隐藏，让用户看到"已完成"而非突然消失
          ctx.shell.state.indexProgress = 100
          progressTimer = setTimeout(() => {
            ctx.shell.state.indexProgress = null
          }, 600)
        }
      })
    )

    // 平台信息决定是否渲染自绘窗口按钮（macOS 用系统红绿灯）
    void ctx.api.window.platform().then((result) => {
      if (result.ok) ctx.shell.state.platform = result.data
    })

    this.dispose = () => {
      for (const stop of stops) stop()
      if (progressTimer) clearTimeout(progressTimer)
    }
  }
}
