import type { BrowserWindow } from 'electron'
import type { IpcRegistrar } from './types'
import type { Migration } from '@main/platform/sqlite/migration-runner'

export class MigrationRegistry {
  private migrations: Migration[] = []

  add(moduleId: string, entries: Migration[]): void {
    for (const entry of entries) {
      if (this.migrations.some((migration) => migration.id === entry.id)) {
        throw new Error(`Duplicate migration ${entry.id} from ${moduleId}`)
      }
      this.migrations.push(entry)
    }
  }

  all(): Migration[] {
    return [...this.migrations]
  }
}

export interface IpcRuntime {
  registrar: IpcRegistrar
  dispose(): void
}

export type { BrowserWindow }
