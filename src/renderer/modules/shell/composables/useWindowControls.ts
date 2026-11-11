// 自绘窗口按钮逻辑：最小化/最大化/关闭均经 IPC 委托主进程执行，
// 最大化状态以主进程事件为准同步，保证与系统行为（双击标题栏等）一致。
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { RendererContext } from '../../../app/context'

export interface WindowControls {
  isMaximized: Ref<boolean>
  minimize(): void
  toggleMaximize(): void
  close(): void
}

export function useWindowControls(ctx: RendererContext): WindowControls {
  const isMaximized = ref(false)
  let off: (() => void) | null = null

  const sync = async (): Promise<void> => {
    const result = await ctx.api.window.isMaximized()
    if (result.ok) isMaximized.value = result.data
  }

  onMounted(() => {
    // 挂载时主动查询一次初始状态，之后靠事件推送保持同步
    void sync()
    off = ctx.events.on('window:maximized-changed', (value) => {
      isMaximized.value = value
    })
  })

  onBeforeUnmount(() => off?.())

  return {
    isMaximized,
    minimize() {
      void ctx.api.window.minimize()
    },
    toggleMaximize() {
      // 用返回值立即刷新图标，事件推送作为兜底，减少按钮状态延迟
      void ctx.api.window.toggleMaximize().then((result) => {
        if (result.ok) isMaximized.value = result.data
      })
    },
    close() {
      void ctx.api.window.close()
    }
  }
}
