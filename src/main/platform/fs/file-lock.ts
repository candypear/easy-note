// 进程内按路径的互斥锁：用 Promise 链把同一 key 的任务串行化，防止并发读写同一文件。
// 无超时机制，依赖任务自身结束；前序任务失败不会阻塞后续任务。
const queues = new Map<string, Promise<unknown>>()

export async function withPathLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  // 吞掉前序任务的错误，保证队列不因某个任务失败而中断
  const next = previous.catch(() => undefined).then(task)
  queues.set(
    key,
    next.finally(() => {
      // 任务结束后清理队列条目；条件意在只清理自己、不误删后来者排入的队列
      if (queues.get(key) === next) queues.delete(key)
    })
  )
  return next
}
