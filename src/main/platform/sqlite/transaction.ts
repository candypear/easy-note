import type { SqliteDatabase } from './connection'

export function runTransaction<T>(db: SqliteDatabase, task: () => T): T {
  return db.transaction(task)
}
