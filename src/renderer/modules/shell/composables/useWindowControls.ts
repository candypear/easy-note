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
      void ctx.api.window.toggleMaximize().then((result) => {
        if (result.ok) isMaximized.value = result.data
      })
    },
    close() {
      void ctx.api.window.close()
    }
  }
}
