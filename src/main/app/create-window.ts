import { BrowserWindow, nativeTheme } from 'electron'
import { join } from 'node:path'
import type { MainContext } from '@main/bootstrap/types'
import { readWindowState, writeWindowState } from './window-state'

export function createMainWindow(ctx: MainContext): BrowserWindow {
  const state = readWindowState(ctx.paths.windowStateFile)
  const isMac = process.platform === 'darwin'
  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    thickFrame: !isMac,
    titleBarOverlay: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#191919' : '#FFFFFF',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false
    }
  })

  if (state.maximized) window.maximize()

  let saveTimer: NodeJS.Timeout | null = null
  const persist = (): void => {
    if (window.isDestroyed()) return
    const bounds = window.getNormalBounds()
    writeWindowState(ctx.paths.windowStateFile, {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: window.isMaximized()
    })
  }
  const schedule = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(persist, 300)
  }

  window.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') {
      console.error(`[renderer:${event.level}] ${event.message}`)
    }
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] process gone', details.reason)
  })
  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('[renderer] load failed', code, description)
  })

  window.on('resize', schedule)
  window.on('move', schedule)
  window.on('close', persist)
  window.once('ready-to-show', () => window.show())

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void window.loadURL(devUrl)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return window
}
