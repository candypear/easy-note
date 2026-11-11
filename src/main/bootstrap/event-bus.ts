// 主进程事件总线：模块间解耦通信，同时把事件转发到渲染进程窗口；事件名与载荷由 shared 契约约束。
import type { BrowserWindow } from 'electron'
import type { EasyNoteEventMap, EventName } from '@shared/contracts/events'

export class EventBus {
  private listeners = new Map<string, Set<(payload: unknown) => void>>()

  constructor(private readonly getWindows: () => BrowserWindow[]) {}

  publish<K extends EventName>(event: K, payload: EasyNoteEventMap[K]): void {
    // 先通知主进程内部订阅者，再广播到渲染进程；跳过已销毁窗口避免 send 抛错
    for (const listener of this.listeners.get(event) ?? []) listener(payload)
    for (const win of this.getWindows()) {
      if (!win.isDestroyed()) win.webContents.send(event, payload)
    }
  }

  // 返回取消订阅函数，便于模块在 stop 时清理监听，防止泄漏
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
