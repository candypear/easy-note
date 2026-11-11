// 应用生命周期编排：按序完成模块装配、迁移收集、IPC 注册、模块启动与窗口创建，并管理退出时的逆序清理。
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
// 防止 before-quit 重入：清理完成后再次调用 app.quit() 会再次触发该事件
let quitting = false

export async function start(): Promise<void> {
  await app.whenReady()
  removeNativeMenu()

  // 装配顺序：先建 IPC 注册器与上下文，再实例化模块 -> 收集迁移 -> 注册 IPC -> 启动模块；
  // 保证渲染窗口出现前所有 handler 已就绪，避免渲染端首批调用落空
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

  // 按装配顺序串行启动；单个模块失败只记日志不中断，避免局部故障拖垮整个应用
  for (const module of modules) {
    try {
      await module.start?.()
    } catch (error) {
      ctx.logger.error(`模块启动失败 ${module.id}`, error)
    }
  }

  // 窗口在服务就绪后创建；先 attach 给 window 模块再套安全策略
  currentWindow = createMainWindow(ctx)
  ctx.services.window.attach(currentWindow)
  applySecurity(currentWindow)
  currentWindow.on('closed', () => {
    currentWindow = null
  })

  // 冒烟测试模式：页面加载完成后延时执行自检脚本，用退出码报告结果
  if (process.env.EASYNOTE_SMOKE === '1') {
    currentWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        const window = currentWindow
        if (window) void runSmoke(ctx, window)
      }, 1200)
    })
  }

  // 退出清理：按装配逆序停止模块（后启动者先停，尊重依赖方向），再注销 IPC、最后关数据库
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

  // 二次启动时聚焦已有窗口而不是新开实例（配合入口处的单实例锁）
  app.on('second-instance', () => {
    if (!currentWindow) return
    if (currentWindow.isMinimized()) currentWindow.restore()
    currentWindow.focus()
  })

  // macOS 点击 Dock 图标时重新显示窗口
  app.on('activate', () => {
    if (currentWindow) currentWindow.show()
  })

  // 拦截首次退出：先异步完成模块清理再真正 quit，防止 SQLite/文件写入被硬中断
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    void (dispose?.() ?? Promise.resolve()).finally(() => app.quit())
  })

  // macOS 惯例：关完窗口应用仍驻留；其他平台直接退出
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

// 冒烟自检：在真实渲染环境里检查 preload 注入、UI 挂载，可选验证编辑落盘与关键交互路径
async function runSmoke(ctx: ReturnType<typeof createContext>, window: BrowserWindow): Promise<void> {
  const marker = `SMOKE-${Date.now()}`
  // 编辑自检脚本：把光标定位到首个段落末尾，为后续模拟键盘输入做准备
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
        // 用真实输入事件逐字符键入标记文本，走完整的编辑器输入链路
        for (const character of ` ${marker}`) {
          window.webContents.sendInputEvent({ type: 'char', keyCode: character })
        }
      }
      // 等待自动保存完成后，直接读磁盘文件验证标记已持久化（端到端校验保存链路）
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

    // UI 自检：模拟点击与快捷键遍历设置/快速切换/标签/搜索/图谱/源码模式等关键交互
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
        const searchTab = [...document.querySelectorAll('.sidebar .tab')]
          .find((tab) => tab.textContent?.includes('搜索'))
        searchTab?.click()
        await wait(200)
        const input = document.querySelector('.search-view input')
        if (input) {
          input.value = 'answer'
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        await wait(500)
        const searchResults = document.querySelectorAll('.search-view .result').length
        document.querySelector('.search-view .result')?.click()
        await wait(450)
        const revealed = Boolean(document.querySelector('.block-flash'))
        return {
          settings, settingsClosed, quickSwitch, tags, tagRows, search, graph, backToEditor,
          sourceMode, wysiwyg, searchResults, revealed
        }
      })()`)
    }

    console.log('[smoke]', JSON.stringify({ ...info, edited, status, saved, tail, ui }))
    // 通过标准：API 已注入且应用已挂载；启用编辑自检时还要求落盘成功。退出码供 CI 判定
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
