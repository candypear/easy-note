import { ipcMain, type BrowserWindow } from 'electron'
import { ipcFail, ipcOk } from '@shared/contracts/envelope'
import { AppError } from '@main/platform/errors'
import type { IpcRegistrar } from './types'

export function createIpcRegistrar(getWindow: () => BrowserWindow | null): IpcRegistrar & {
  dispose(): void
} {
  const channels = new Set<string>()

  return {
    handle(channel, handler) {
      if (channels.has(channel)) throw new Error(`Duplicate IPC channel ${channel}`)
      channels.add(channel)
      ipcMain.handle(channel, async (event, payload: unknown) => {
        const window = getWindow()
        if (!window || event.sender !== window.webContents) {
          return ipcFail('INVALID_REQUEST', '拒绝来自未知窗口的请求')
        }
        try {
          return ipcOk(await handler(payload))
        } catch (error) {
          if (error instanceof AppError) return ipcFail(error.code, error.message)
          return ipcFail('INTERNAL', error instanceof Error ? error.message : String(error))
        }
      })
    },
    dispose() {
      for (const channel of channels) ipcMain.removeHandler(channel)
      channels.clear()
    }
  }
}
