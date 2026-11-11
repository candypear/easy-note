// 迁移注册表：按模块收集迁移并做全局 ID 去重，保证不同模块的迁移不会冲突或重复执行。
import type { BrowserWindow } from 'electron'
import type { IpcRegistrar } from './types'
import type { Migration } from '@main/platform/sqlite/migration-runner'

export class MigrationRegistry {
  private migrations: Migration[] = []

  add(moduleId: string, entries: Migration[]): void {
    for (const entry of entries) {
      // 全局唯一性校验：重复 ID 会导致版本判断错乱，装配期直接抛错尽早暴露
      if (this.migrations.some((migration) => migration.id === entry.id)) {
        throw new Error(`Duplicate migration ${entry.id} from ${moduleId}`)
      }
      this.migrations.push(entry)
    }
  }

  all(): Migration[] {
    // 返回副本，防止外部修改注册表内部顺序
    return [...this.migrations]
  }
}

export interface IpcRuntime {
  registrar: IpcRegistrar
  dispose(): void
}

export type { BrowserWindow }
