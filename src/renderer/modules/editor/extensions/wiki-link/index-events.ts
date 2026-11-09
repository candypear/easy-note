import type { RendererContext } from '../../../../app/context'

const listeners = new Set<() => void>()
let stop: (() => void) | null = null

/**
 * Share one `index:updated` subscription across every rendered wiki link.
 * Per-node subscriptions would exhaust the IPC EventEmitter limit on notes
 * containing many links.
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
