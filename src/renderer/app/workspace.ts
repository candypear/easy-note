// 工作区状态服务：以 reactive 单例承载当前笔记、保存状态与文档统计，
// 供编辑器、状态栏、大纲等模块共享；"保存/查找"等命令用递增计数器广播。
import { reactive } from 'vue'
import type { Heading, RevealTarget, WorkspaceService } from './context'

export interface WorkspaceState {
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
  findRequest: number
  insertHeadingRequest: number
  reveal: RevealTarget | null
}

export interface Workspace extends WorkspaceService {
  state: WorkspaceState
}

export function createWorkspace(): Workspace {
  const state = reactive<WorkspaceState>({
    currentNoteId: null,
    currentNoteTitle: '',
    currentNotePath: '',
    sourceMode: false,
    view: 'note',
    saveState: 'saved',
    wordCount: 0,
    charCount: 0,
    readingMinutes: 0,
    headings: [],
    documentText: '',
    saveRequest: 0,
    findRequest: 0,
    insertHeadingRequest: 0,
    reveal: null
  })

  // nonce 单调递增：即使重复打开同一笔记，reveal 引用也必然变化以触发编辑器定位
  let nonce = 0
  // 大纲点击标题 → 编辑器滚动定位的监听集合，避免两模块直接互相引用
  const headingListeners = new Set<(heading: Heading) => void>()

  // 用 getter/setter 把服务属性桥接到 reactive state，
  // 使解构外的属性读写（含模板中）保持响应式
  return {
    state,
    get currentNoteId() {
      return state.currentNoteId
    },
    set currentNoteId(value) {
      state.currentNoteId = value
    },
    get currentNoteTitle() {
      return state.currentNoteTitle
    },
    set currentNoteTitle(value) {
      state.currentNoteTitle = value
    },
    get currentNotePath() {
      return state.currentNotePath
    },
    set currentNotePath(value) {
      state.currentNotePath = value
    },
    get sourceMode() {
      return state.sourceMode
    },
    set sourceMode(value) {
      state.sourceMode = value
    },
    get view() {
      return state.view
    },
    set view(value) {
      state.view = value
    },
    get saveState() {
      return state.saveState
    },
    set saveState(value) {
      state.saveState = value
    },
    get wordCount() {
      return state.wordCount
    },
    set wordCount(value) {
      state.wordCount = value
    },
    get charCount() {
      return state.charCount
    },
    set charCount(value) {
      state.charCount = value
    },
    get readingMinutes() {
      return state.readingMinutes
    },
    set readingMinutes(value) {
      state.readingMinutes = value
    },
    get headings() {
      return state.headings
    },
    set headings(value) {
      state.headings = value
    },
    get documentText() {
      return state.documentText
    },
    set documentText(value) {
      state.documentText = value
    },
    get saveRequest() {
      return state.saveRequest
    },
    get findRequest() {
      return state.findRequest
    },
    get insertHeadingRequest() {
      return state.insertHeadingRequest
    },
    get reveal() {
      return state.reveal
    },
    set reveal(value) {
      state.reveal = value
    },
    openNote(noteId, options) {
      // 切换笔记即回到笔记视图并重置保存状态；定位参数随 reveal 一并下发
      nonce += 1
      state.currentNoteId = noteId
      state.view = 'note'
      state.saveState = 'saved'
      state.reveal = { ...options, noteId, nonce }
    },
    closeNote() {
      // 清空文档相关缓存，防止状态栏/大纲继续显示上一篇的数据
      state.currentNoteId = null
      state.currentNoteTitle = ''
      state.currentNotePath = ''
      state.documentText = ''
      state.headings = []
      state.saveState = 'saved'
    },
    toggleSourceMode() {
      state.sourceMode = !state.sourceMode
    },
    setSourceMode(value) {
      state.sourceMode = value
    },
    openGraph() {
      state.view = 'graph'
    },
    backToNote() {
      state.view = 'note'
    },
    notifyReveal(target) {
      state.reveal = target
    },
    // 以下三个 request* 只递增计数器：编辑器 watch 计数变化执行动作，
    // 用"信号"而非直接调用，保持快捷键/状态栏与编辑器实例解耦
    requestSave() {
      state.saveRequest += 1
    },
    requestFind() {
      state.findRequest += 1
    },
    requestInsertHeading() {
      state.insertHeadingRequest += 1
    },
    focusHeading(heading) {
      for (const listener of headingListeners) listener(heading)
    },
    onFocusHeading(listener) {
      headingListeners.add(listener)
      return () => headingListeners.delete(listener)
    },
    setDocumentStats(stats) {
      state.wordCount = stats.words
      state.charCount = stats.characters
      state.readingMinutes = stats.readingMinutes
    },
    setHeadings(headings) {
      state.headings = headings
    },
    setDocumentText(text) {
      state.documentText = text
    },
    setSaveState(saveState) {
      state.saveState = saveState
    }
  }
}
