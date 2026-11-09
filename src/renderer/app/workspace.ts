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

  let nonce = 0
  const headingListeners = new Set<(heading: Heading) => void>()

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
      nonce += 1
      state.currentNoteId = noteId
      state.view = 'note'
      state.saveState = 'saved'
      state.reveal = { ...options, noteId, nonce }
    },
    closeNote() {
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
