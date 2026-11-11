// 引导层核心契约：定义模块接口（MainModule）与依赖注入上下文（MainContext），是模块与组合根间的边界。
import type { BrowserWindow } from 'electron'
import type { EasyNoteEventMap, EventName } from '@shared/contracts/events'
import type { Migration } from '@main/platform/sqlite/migration-runner'
import type { SqliteDatabase } from '@main/platform/sqlite/connection'
import type { FileSystemPort } from '@main/platform/fs/filesystem'
import type { WatcherPort } from '@main/platform/watcher/vault-watcher'
import type { TrashPort } from '@main/platform/trash/system-trash'
import type { DialogPort } from '@main/platform/dialog/folder-picker'
import type { ThemePort } from '@main/platform/theme/system-theme'
import type { LoggerPort } from '@main/platform/logger/logger'
import type { MainServices } from './services'

export interface AppPaths {
  userData: string
  settingsFile: string
  windowStateFile: string
  logsDir: string
  documents: string
}

export interface IpcRegistrar {
  handle(channel: string, handler: (payload: unknown) => unknown | Promise<unknown>): void
}

export interface MainEventBus {
  publish<K extends EventName>(event: K, payload: EasyNoteEventMap[K]): void
  subscribe<K extends EventName>(
    event: K,
    listener: (payload: EasyNoteEventMap[K]) => void
  ): () => void
}

export interface MigrationRegistry {
  add(moduleId: string, migrations: Migration[]): void
  all(): Migration[]
}

// 模块统一接口：迁移与 IPC 在装配期同步注册，start/stop 为可选异步生命周期钩子（启动正序、退出逆序调用）
export interface MainModule {
  id: string
  migrations: Migration[]
  registerIpc(ipc: IpcRegistrar): void
  start?(): Promise<void>
  stop?(): Promise<void>
}

// 依赖注入上下文：模块只依赖此接口而非具体实现，平台能力均以 Port 形式暴露，便于测试替换
export interface MainContext {
  paths: AppPaths
  db: SqliteDatabase
  events: MainEventBus
  fs: FileSystemPort
  watcher: WatcherPort
  trash: TrashPort
  dialog: DialogPort
  theme: ThemePort
  logger: LoggerPort
  ipc: IpcRegistrar
  migrations: MigrationRegistry
  services: MainServices
  getMainWindow(): BrowserWindow | null
}
