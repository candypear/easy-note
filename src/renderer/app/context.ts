// 渲染进程核心契约：定义全局上下文 RendererContext 及 shell/workspace/快捷键等服务接口，
// 各模块只依赖这里的类型而非具体实现，实现由 app/ 与 shell 模块提供。
import type { Component } from 'vue'
import type { EasyNoteApi } from '@shared/contracts/api'
import type { ThemeMode } from '@shared/contracts/settings'

export interface I18n {
  t(key: string, params?: Record<string, string | number>): string
}

export interface SidebarView {
  id: string
  titleKey: string
  icon: string
  order: number
  component: Component
}

export interface WorkspaceView {
  id: string
  order: number
  component: Component
}

export interface RightPanelTab {
  id: string
  titleKey: string
  order: number
  component: Component
}

export interface StatusItem {
  id: string
  order: number
  component: Component
}

// 外壳插槽注册表：模块把视图/标签/状态项/浮层组件注册进来，
// shell 组件按 order 排序渲染，实现外壳与业务模块解耦
export interface ShellRegistry {
  sidebar: {
    registerView(view: SidebarView): void
    views(): SidebarView[]
  }
  workspace: {
    registerView(view: WorkspaceView): void
    views(): WorkspaceView[]
  }
  rightPanel: {
    registerTab(tab: RightPanelTab): void
    tabs(): RightPanelTab[]
  }
  status: {
    registerItem(item: StatusItem): void
    items(): StatusItem[]
  }
  overlay: {
    register(id: string, component: Component): void
    get(id: string): Component | undefined
  }
}

export interface ShellState {
  sidebarWidth: number
  rightWidth: number
  sidebarOpen: boolean
  rightOpen: boolean
  sidebarView: string
  workspaceView: string
  rightTab: string
  themeMode: ThemeMode
  resolvedTheme: 'light' | 'dark'
  overlay: string | null
  vaultName: string
  vaultPath: string | null
  platform: string
  fontSize: 14 | 16 | 18
  indexProgress: number | null
  vaultOpen: boolean
  booted: boolean
}

export interface ShellService {
  state: ShellState
  registry: ShellRegistry
  toggleSidebar(): void
  toggleRight(): void
  setSidebarWidth(width: number): void
  setRightWidth(width: number): void
  setSidebarView(id: string): void
  setWorkspaceView(id: string): void
  setRightTab(id: string): void
  openOverlay(id: string): void
  closeOverlay(): void
  setThemeMode(mode: ThemeMode): void
}

export interface Heading {
  level: number
  text: string
  pos: number
}

// 编辑器内的定位目标：nonce 单调递增，保证重复打开同一笔记/同一块也能触发定位
export interface RevealTarget {
  noteId: string
  nonce: number
  line?: number
  blockId?: string
  title?: string
  highlight?: boolean
}

// 工作区服务：当前笔记、保存状态、文档统计的单一数据源；
// saveRequest/findRequest 等计数器是"命令信号"，编辑器 watch 其变化来执行动作
export interface WorkspaceService {
  currentNoteId: string | null
  currentNoteTitle: string
  currentNotePath: string
  sourceMode: boolean
  view: 'note' | 'graph'
  saveState: 'saved' | 'dirty' | 'saving' | 'error'
  wordCount: number
  charCount: number
  readingMinutes: number
  headings: Heading[]
  documentText: string
  saveRequest: number
  reveal: RevealTarget | null
  openNote(noteId: string, options?: Omit<RevealTarget, 'noteId' | 'nonce'>): void
  closeNote(): void
  toggleSourceMode(): void
  setSourceMode(value: boolean): void
  openGraph(): void
  backToNote(): void
  notifyReveal(target: RevealTarget): void
  requestSave(): void
  requestFind(): void
  findRequest: number
  insertHeadingRequest: number
  requestInsertHeading(): void
  focusHeading(heading: Heading): void
  onFocusHeading(listener: (heading: Heading) => void): () => void
  setDocumentStats(stats: { words: number; characters: number; readingMinutes: number }): void
  setHeadings(headings: Heading[]): void
  setDocumentText(text: string): void
  setSaveState(state: WorkspaceService['saveState']): void
}

// 全局快捷键注册表：register 返回反注册函数，供模块卸载时清理
export interface ShortcutRegistry {
  register(combo: string, handler: (event: KeyboardEvent) => void): () => void
  dispose(): void
}

export interface RendererContext {
  api: EasyNoteApi
  events: EasyNoteApi['events']
  i18n: I18n
  shortcuts: ShortcutRegistry
  shell: ShellService
  workspace: WorkspaceService
}

// 渲染模块协议：install 在启动时按序调用，dispose 用于释放监听器等副作用
export interface RendererModule {
  id: string
  install(app: unknown, ctx: RendererContext): void
  dispose?(): void
}
