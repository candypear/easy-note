import type { EasyNoteEventMap, EventName, EventsApi } from '@shared/contracts/events'
import { EVENT_NAMES } from '@shared/contracts/events'
import type { IpcRendererEvent } from 'electron'
import { ipcRenderer } from 'electron'

const channels = new Set<string>(EVENT_NAMES)

export const eventsApi: EventsApi = {
  on(event, listener) {
    if (!channels.has(event)) throw new Error(`Unknown event ${event}`)
    const handler = (_event: IpcRendererEvent, payload: EasyNoteEventMap[EventName]): void => {
      ;(listener as (value: EasyNoteEventMap[EventName]) => void)(payload)
    }
    ipcRenderer.on(event, handler)
    return () => ipcRenderer.removeListener(event, handler)
  }
}
