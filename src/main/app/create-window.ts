// 主窗口创建：恢复窗口几何状态、配置安全的 webPreferences，并负责窗口状态持久化与右键菜单。
import { BrowserWindow, Menu, MenuItem, nativeTheme } from 'electron'
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
    // 先隐藏，等 ready-to-show 再显示，避免白屏闪烁；背景色跟随系统主题
    show: false,
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    thickFrame: !isMac,
    titleBarOverlay: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0d0d0d' : '#FFFFFF',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      // 安全基线：上下文隔离 + 沙箱 + 禁用 Node 集成，渲染进程只能通过 preload 白名单 API 通信
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false
    }
  })

  if (state.maximized) window.maximize()

  // 窗口几何持久化：resize/move 高频触发，用 300ms 防抖合并写盘；close 时立即落盘兜底
  let saveTimer: NodeJS.Timeout | null = null
  const persist = (): void => {
    if (window.isDestroyed()) return
    // 取 normal（非最大化）尺寸，保证下次还原时恢复的是用户调整过的窗口大小
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

  // 把渲染进程的错误/警告与崩溃、加载失败转发到主进程日志，便于排查渲染侧问题
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

  // 自定义右键菜单：仅在可编辑区域或有选中文本时弹出，按 editFlags 控制各项可用性
  window.webContents.on('context-menu', (_event, params) => {
    const flags = params.editFlags
    const hasSelection = params.selectionText.trim().length > 0
    if (!params.isEditable && !hasSelection) return

    const menu = new Menu()
    if (params.isEditable) {
      menu.append(new MenuItem({ label: '撤销', role: 'undo', enabled: flags.canUndo }))
      menu.append(new MenuItem({ label: '重做', role: 'redo', enabled: flags.canRedo }))
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({ label: '剪切', role: 'cut', enabled: flags.canCut }))
    }
    menu.append(new MenuItem({ label: '复制', role: 'copy', enabled: flags.canCopy }))
    if (params.isEditable) {
      menu.append(new MenuItem({ label: '粘贴', role: 'paste', enabled: flags.canPaste }))
      menu.append(new MenuItem({ type: 'separator' }))
    }
    menu.append(new MenuItem({ label: '全选', role: 'selectAll', enabled: flags.canSelectAll }))
    menu.popup({ window })
  })

  window.on('resize', schedule)
  window.on('move', schedule)
  window.on('close', persist)
  window.once('ready-to-show', () => window.show())

  // 开发模式加载 Vite dev server（支持 HMR），生产模式加载打包后的本地文件
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void window.loadURL(devUrl)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return window
}
