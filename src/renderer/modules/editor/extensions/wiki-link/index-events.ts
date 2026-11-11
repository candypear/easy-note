// wiki 链接视图共享的索引更新订阅：合并为单一 IPC 事件监听并扇出到各视图。
import type { RendererContext } from '../../../../app/context'

const listeners = new Set<() => void>()
let stop: (() => void) | null = null

/**
 * 所有已渲染的 wiki 链接共享一个 `index:updated` 订阅。
 * 若每个节点各自订阅，链接多的笔记会超出 IPC EventEmitter 的监听器上限。
 * 最后一个监听者退订时才真正解除底层订阅。
 */
export function onWikiIndexUpdated(ctx: RendererContext, listener: () => void): () => void {
  listeners.add(listener)
  if (!stop) {
    stop = ctx.events.on('index:updated', () => {
      for (const fn of listeners) fn()
    })
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && stop) {
      stop()
      stop = null
    }
  }
}
