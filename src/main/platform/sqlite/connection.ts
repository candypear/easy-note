// SQLite 连接封装（better-sqlite3）：管理打开/关闭、pragma 配置与 FTS5 能力探测。
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
    // 先关旧连接，保证同一实例只持有一个数据库（如切换笔记库时复用）
    this.close()
    mkdirSync(dirname(path), { recursive: true })
    const connection = new BetterSqlite3(path)
    // WAL：读写并发不互相阻塞；NORMAL：WAL 下每次提交不强制 fsync，兼顾性能与安全；
    // 开启外键约束保证引用完整性
    connection.pragma('journal_mode = WAL')
    connection.pragma('synchronous = NORMAL')
    connection.pragma('foreign_keys = ON')
    this.connection = connection
    // 用临时探针表检测当前构建是否支持 FTS5 + trigram 分词（中文全文搜索依赖），
    // 不支持则置 fts=false，上层可回退到 LIKE 搜索
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
