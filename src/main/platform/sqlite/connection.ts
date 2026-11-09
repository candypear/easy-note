import BetterSqlite3 from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface StatementLike<T> {
  get(...params: unknown[]): T | undefined
  all(...params: unknown[]): T[]
  run(...params: unknown[]): { changes: number }
}

export class SqliteDatabase {
  private connection: BetterSqlite3.Database | null = null
  private fts = false

  get isOpen(): boolean {
    return this.connection !== null
  }

  get ftsAvailable(): boolean {
    return this.fts
  }

  open(path: string): void {
    this.close()
    mkdirSync(dirname(path), { recursive: true })
    const connection = new BetterSqlite3(path)
    connection.pragma('journal_mode = WAL')
    connection.pragma('synchronous = NORMAL')
    connection.pragma('foreign_keys = ON')
    this.connection = connection
    try {
      connection.exec("CREATE VIRTUAL TABLE IF NOT EXISTS __fts_probe USING fts5(x, tokenize='trigram')")
      connection.exec('DROP TABLE IF EXISTS __fts_probe')
      this.fts = true
    } catch {
      this.fts = false
    }
  }

  close(): void {
    this.connection?.close()
    this.connection = null
  }

  raw(): BetterSqlite3.Database {
    if (!this.connection) throw new Error('Database is not open')
    return this.connection
  }

  exec(sql: string): void {
    this.raw().exec(sql)
  }

  prepare<T = unknown>(sql: string): StatementLike<T> {
    return this.raw().prepare(sql) as unknown as StatementLike<T>
  }

  transaction<T>(task: () => T): T {
    return this.raw().transaction(task)()
  }
}
