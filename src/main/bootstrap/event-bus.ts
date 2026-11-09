import type { BrowserWindow } from 'electron'
import type { EasyNoteEventMap, EventName } from '@shared/contracts/events'

export class EventBus {
  private listeners = new Map<string, Set<(payload: unknown) => void>>()

  constructor(private readonly getWindows: () => BrowserWindow[]) {}

  publish<K extends EventName>(event: K, payload: EasyNoteEventMap[K]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload)
    for (const win of this.getWindows()) {
      if (!win.isDestroyed()) win.webContents.send(event, payload)
    }
  }

  subscribe<K extends EventName>(
    event: K,
    listener: (payload: EasyNoteEventMap[K]) => void
  ): () => void {
    const entry = listener as (payload: unknown) => void
    const set = this.listeners.get(event) ?? new Set()
    set.add(entry)
    this.listeners.set(event, set)
    return () => set.delete(entry)
  }
}
