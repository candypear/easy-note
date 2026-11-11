// 事务辅助：把任务包进 SQLite 事务，任务抛错自动回滚，成功则提交。
import type { SqliteDatabase } from './connection'

export function runTransaction<T>(db: SqliteDatabase, task: () => T): T {
  return db.transaction(task)
}
