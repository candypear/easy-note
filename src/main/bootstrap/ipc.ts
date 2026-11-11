// IPC 注册器：统一封装 ipcMain.handle，做通道去重、来源窗口校验与错误到 Result 信封的转换。
import { ipcMain, type BrowserWindow } from 'electron'
import { ipcFail, ipcOk } from '@shared/contracts/envelope'
import { AppError } from '@main/platform/errors'
import type { IpcRegistrar } from './types'

export function createIpcRegistrar(getWindow: () => BrowserWindow | null): IpcRegistrar & {
  dispose(): void
} {
  // 记录已注册通道：重复注册直接抛错（装配期即暴露问题），并支持退出时统一注销
  const channels = new Set<string>()

  return {
    handle(channel, handler) {
      if (channels.has(channel)) throw new Error(`Duplicate IPC channel ${channel}`)
      channels.add(channel)
      ipcMain.handle(channel, async (event, payload: unknown) => {
        // 只接受当前主窗口的请求，拒绝其他 webContents（如被注入的 iframe）调用特权 API
        const window = getWindow()
        if (!window || event.sender !== window.webContents) {
          return ipcFail('INVALID_REQUEST', '拒绝来自未知窗口的请求')
        }
        try {
          return ipcOk(await handler(payload))
        } catch (error) {
          // 异常不外抛：业务错误保留错误码，未知错误归为 INTERNAL，渲染端统一按 Result 处理
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
