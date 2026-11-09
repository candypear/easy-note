import type { IpcResult } from '@shared/contracts/envelope'
import { ipcRenderer } from 'electron'

export function invoke<T>(channel: string): Promise<IpcResult<T>>
export function invoke<T>(channel: string, payload: unknown): Promise<IpcResult<T>>
export function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<IpcResult<T>>
}
