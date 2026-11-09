import type { IpcError } from './errors'

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

export const ipcOk = <T>(data: T): IpcResult<T> => ({ ok: true, data })
export const ipcFail = (code: IpcError['code'], message: string): IpcResult<never> => ({
  ok: false,
  error: { code, message }
})
