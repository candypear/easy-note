// IPC 响应信封：所有主进程 handler 统一返回 IpcResult，避免用异常跨越进程边界。
import type { IpcError } from './errors'

// 判别联合：ok 为 true 时携带 data，false 时携带结构化错误，渲染端据 ok 分支处理。
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

// 成功/失败信封的构造助手，保证两端结构一致；ipcFail 返回 never 数据以兼容任意 T。
export const ipcOk = <T>(data: T): IpcResult<T> => ({ ok: true, data })
export const ipcFail = (code: IpcError['code'], message: string): IpcResult<never> => ({
  ok: false,
  error: { code, message }
})
