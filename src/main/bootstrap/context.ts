// 组合根上下文：集中实例化平台端口（fs/sqlite/watcher 等）与共享设施，作为依赖注入容器传给各模块。
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { SqliteDatabase } from '@main/platform/sqlite/connection'
import { createFileSystem } from '@main/platform/fs/filesystem'
import { createWatcher } from '@main/platform/watcher/vault-watcher'
import { createTrash } from '@main/platform/trash/system-trash'
import { createDialog } from '@main/platform/dialog/folder-picker'
import { createThemePort } from '@main/platform/theme/system-theme'
import { createLogger } from '@main/platform/logger/logger'
import { EventBus } from './event-bus'
import { MigrationRegistry } from './registry'
import type { AppPaths, IpcRegistrar, MainContext } from './types'
import type { MainServices } from './services'

export interface ContextOptions {
  userData: string
  documents: string
  getWindow(): BrowserWindow | null
  ipc: IpcRegistrar
}

export function createContext(options: ContextOptions): MainContext {
  const paths: AppPaths = {
    userData: options.userData,
    settingsFile: join(options.userData, 'settings.json'),
    windowStateFile: join(options.userData, 'window-state.json'),
    logsDir: join(options.userData, 'logs'),
    documents: options.documents
  }
  const db = new SqliteDatabase()
  // services 先置空对象，由 modules.ts 装配时逐个填充；模块创建期只允许持有 ctx，不得同步调用他人 service
  const services = {} as MainServices
  return {
    paths,
    db,
    // 延迟获取窗口：事件可能在窗口创建前/销毁后发布，通过回调取当前窗口避免持有过期引用
    events: new EventBus(() => {
      const window = options.getWindow()
      return window ? [window] : []
    }),
    fs: createFileSystem(),
    watcher: createWatcher(),
    trash: createTrash(),
    dialog: createDialog(),
    theme: createThemePort(),
    logger: createLogger(options.userData),
    ipc: options.ipc,
    migrations: new MigrationRegistry(),
    services,
    getMainWindow: options.getWindow
  }
}
