import type { MainContext, MainModule } from './types'
import { runMigrations } from '@main/platform/sqlite/migration-runner'

export function collectMigrations(modules: MainModule[], ctx: MainContext): void {
  for (const module of modules) ctx.migrations.add(module.id, module.migrations)
}

export function registerIpc(modules: MainModule[], ctx: MainContext): void {
  for (const module of modules) module.registerIpc(ctx.ipc)
}

export function applyMigrations(ctx: MainContext): string[] {
  const migrations = ctx.migrations.all()
  const executed = runMigrations(ctx.db, migrations)
  ctx.db
    .prepare(
      'INSERT INTO vault_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run('schema_version', String(migrations.length))
  ctx.db
    .prepare(
      'INSERT INTO vault_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run('last_scan_at', new Date().toISOString())
  return executed
}
