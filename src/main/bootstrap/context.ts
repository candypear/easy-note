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
  const services = {} as MainServices
  return {
    paths,
    db,
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
