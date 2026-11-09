import type { SqliteDatabase } from './connection'

export interface Migration {
  id: string
  up(db: SqliteDatabase): void
}

export function runMigrations(db: SqliteDatabase, migrations: Migration[]): string[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)'
  )
  const applied = new Set(
    db
      .prepare<{ id: string }>('SELECT id FROM schema_migrations')
      .all()
      .map((row) => row.id)
  )
  const executed: string[] = []
  const insert = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    db.transaction(() => {
      migration.up(db)
      insert.run(migration.id, new Date().toISOString())
    })
    executed.push(migration.id)
  }
  return executed
}
