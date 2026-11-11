// 进程内通用的 Result 类型：以返回值代替抛异常表达失败（IPC 边界用 envelope.ts 的 IpcResult）。
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })
