import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { createContext } from './context'
import { createIpcRegistrar } from './ipc'
import { createModules } from './modules'
import { collectMigrations, registerIpc } from './migrations'
import type { MainModule } from './types'
import { createMainWindow } from '@main/app/create-window'
import { removeNativeMenu } from '@main/app/menu'
import { applySecurity } from '@main/app/security'

let currentWindow: BrowserWindow | null = null
let modules: MainModule[] = []
let dispose: (() => Promise<void>) | null = null
let quitting = false

export async function start(): Promise<void> {
  await app.whenReady()
  removeNativeMenu()

  const ipc = createIpcRegistrar(() => currentWindow)
  const ctx = createContext({
    userData: app.getPath('userData'),
    documents: app.getPath('documents'),
    getWindow: () => currentWindow,
    ipc
  })
  modules = createModules(ctx)
  collectMigrations(modules, ctx)
  registerIpc(modules, ctx)

  for (const module of modules) {
    try {
      await module.start?.()
    } catch (error) {
      ctx.logger.error(`模块启动失败 ${module.id}`, error)
    }
  }

  currentWindow = createMainWindow(ctx)
  ctx.services.window.attach(currentWindow)
  applySecurity(currentWindow)
  currentWindow.on('closed', () => {
    currentWindow = null
  })

  if (process.env.EASYNOTE_SMOKE === '1') {
    currentWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        const window = currentWindow
        if (window) void runSmoke(ctx, window)
      }, 1200)
    })
  }

  dispose = async () => {
    for (const module of [...modules].reverse()) {
      try {
        await module.stop?.()
      } catch (error) {
        ctx.logger.error(`模块停止失败 ${module.id}`, error)
      }
    }
    ipc.dispose()
    ctx.db.close()
  }

  app.on('second-instance', () => {
    if (!currentWindow) return
    if (currentWindow.isMinimized()) currentWindow.restore()
    currentWindow.focus()
  })

  app.on('activate', () => {
    if (currentWindow) currentWindow.show()
  })

  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    void (dispose?.() ?? Promise.resolve()).finally(() => app.quit())
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

async function runSmoke(ctx: ReturnType<typeof createContext>, window: BrowserWindow): Promise<void> {
  const marker = `SMOKE-${Date.now()}`
  const editScript = process.env.EASYNOTE_SMOKE_EDIT === '1'
    ? `(() => {
        const element = document.querySelector('.ProseMirror')
        const target = element?.querySelector('p')
        if (!element || !target) return false
        element.focus()
        const selection = window.getSelection()
        if (!selection) return false
        const range = document.createRange()
        range.selectNodeContents(target)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
        return true
      })()`
    : 'false'

  try {
    const info = (await window.webContents.executeJavaScript(`(() => ({
      api: typeof window.easynote,
      mounted: Boolean(document.querySelector('#app > *')),
      editor: Boolean(document.querySelector('.ProseMirror')),
      shell: Boolean(document.querySelector('.app-shell')),
      welcome: Boolean(document.querySelector('.vault-welcome')),
      codeBlocks: document.querySelectorAll('.code-block').length,
      wikiLinks: [...document.querySelectorAll('.wiki-link')].map((element) => element.textContent),
      blockRefs: [...document.querySelectorAll('.block-ref')].map((element) => element.textContent),
      mathBlocks: document.querySelectorAll('.math-block').length,
      tables: document.querySelectorAll('table').length,
      tasks: document.querySelectorAll('ul[data-type="taskList"] input').length
    }))()`)) as Record<string, unknown>

    let saved: boolean | null = null
    let edited: unknown = null
    let tail = ''
    let status = ''
    let ui: unknown = null
    if (process.env.EASYNOTE_SMOKE_EDIT === '1') {
      edited = await window.webContents.executeJavaScript(editScript)
      if (edited === true) {
        window.focus()
        for (const character of ` ${marker}`) {
          window.webContents.sendInputEvent({ type: 'char', keyCode: character })
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1800))
      status = (await window.webContents.executeJavaScript(
        `document.querySelector('.statusbar')?.innerText ?? ''`
      )) as string
      const notes = await ctx.services.note.listAll()
      const root = ctx.services.vault.root
      if (root && notes[0]) {
        const content = await ctx.fs.readFile(join(root, notes[0].path))
        saved = content.includes(marker)
        tail = content.slice(-120)
      } else {
        saved = false
      }
    }

    if (process.env.EASYNOTE_SMOKE_UI === '1') {
      ui = await window.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
        document.querySelector('[aria-label="设置"]')?.click()
        await wait(200)
        const settings = Boolean(document.querySelector('.dialog-panel')) &&
          document.body.innerText.includes('设置')
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await wait(120)
        const settingsClosed = !document.querySelector('.dialog-panel')
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
        await wait(200)
        const quickSwitch = Boolean(document.querySelector('.quick-switch'))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await wait(120)
        const tabs = [...document.querySelectorAll('.sidebar .tab')]
        tabs.find((tab) => tab.textContent?.includes('标签'))?.click()
        await wait(200)
        const tags = Boolean(document.querySelector('.tags-view'))
        const tagRows = document.querySelectorAll('.tag-row').length
        tabs.find((tab) => tab.textContent?.includes('搜索'))?.click()
        await wait(200)
        const search = Boolean(document.querySelector('.search-view'))
        document.querySelector('.graph-button')?.click()
        await wait(400)
        const graph = Boolean(document.querySelector('.graph-view'))
        const back = [...document.querySelectorAll('.graph-view .text-button')]
          .find((button) => button.textContent?.includes('返回'))
        back?.click()
        await wait(200)
        const backToEditor = Boolean(document.querySelector('.ProseMirror'))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, bubbles: true }))
        await wait(250)
        const sourceMode = Boolean(document.querySelector('.source-mode .cm-editor'))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, bubbles: true }))
        await wait(350)
        const wysiwyg = Boolean(document.querySelector('.ProseMirror'))
        return {
          settings, settingsClosed, quickSwitch, tags, tagRows, search, graph, backToEditor,
          sourceMode, wysiwyg
        }
      })()`)
    }

    console.log('[smoke]', JSON.stringify({ ...info, edited, status, saved, tail, ui }))
    const ok =
      info.api === 'object' &&
      info.mounted === true &&
      (saved === null || saved === true)
    app.exit(ok ? 0 : 1)
  } catch (error) {
    console.error('[smoke] failed', error)
    app.exit(1)
  }
}
