// ipcRenderer.invoke 的类型化薄封装：统一断言返回值为 IpcResult 信封。
// 业务错误由主进程包在信封里返回而非抛出，各模块 API 只需转发通道与参数。
import type { IpcResult } from '@shared/contracts/envelope'
import { ipcRenderer } from 'electron'

export function invoke<T>(channel: string): Promise<IpcResult<T>>
export function invoke<T>(channel: string, payload: unknown): Promise<IpcResult<T>>
export function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<IpcResult<T>>
}
