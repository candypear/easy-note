// 事件订阅桥接：按 EVENT_NAMES 白名单校验事件名，只允许监听契约内声明的通道。
import type { EasyNoteEventMap, EventName, EventsApi } from '@shared/contracts/events'
import { EVENT_NAMES } from '@shared/contracts/events'
import type { IpcRendererEvent } from 'electron'
import { ipcRenderer } from 'electron'

const channels = new Set<string>(EVENT_NAMES)

export const eventsApi: EventsApi = {
  on(event, listener) {
    if (!channels.has(event)) throw new Error(`Unknown event ${event}`)
    // 包一层 handler 剥掉 IpcRendererEvent，只把 payload 交给渲染端监听器
    const handler = (_event: IpcRendererEvent, payload: EasyNoteEventMap[EventName]): void => {
      ;(listener as (value: EasyNoteEventMap[EventName]) => void)(payload)
    }
    ipcRenderer.on(event, handler)
    // 返回取消函数并精确移除该 handler，避免组件反复挂载导致监听器堆积
    return () => ipcRenderer.removeListener(event, handler)
  }
}
