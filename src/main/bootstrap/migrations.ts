// 引导层装配辅助：汇总各模块的迁移与 IPC 注册，并提供打开 vault 时执行迁移的入口。
import type { MainContext, MainModule } from './types'
import { runMigrations } from '@main/platform/sqlite/migration-runner'

export function collectMigrations(modules: MainModule[], ctx: MainContext): void {
  for (const module of modules) ctx.migrations.add(module.id, module.migrations)
}

export function registerIpc(modules: MainModule[], ctx: MainContext): void {
  for (const module of modules) module.registerIpc(ctx.ipc)
}

// 在 vault 数据库上执行全部已收集迁移（幂等，由 runner 跳过已执行项），并刷新元信息
export function applyMigrations(ctx: MainContext): string[] {
  const migrations = ctx.migrations.all()
  const executed = runMigrations(ctx.db, migrations)
  // upsert 元信息：schema_version 记录当前迁移总数，last_scan_at 标记本次打开时间
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
