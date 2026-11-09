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

export interface RevealTarget {
  noteId: string
  nonce: number
  line?: number
  blockId?: string
  title?: string
  highlight?: boolean
}

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
  focusHeading(pos: number): void
  onFocusHeading(listener: (pos: number) => void): () => void
  setDocumentStats(stats: { words: number; characters: number; readingMinutes: number }): void
  setHeadings(headings: Heading[]): void
  setDocumentText(text: string): void
  setSaveState(state: WorkspaceService['saveState']): void
}

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

export interface RendererModule {
  id: string
  install(app: unknown, ctx: RendererContext): void
  dispose?(): void
}
