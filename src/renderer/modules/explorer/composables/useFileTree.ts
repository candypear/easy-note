import { asNoteId } from '@shared/types/brand'
import type { ExplorerState } from '../stores/explorer-store'
import type { RendererContext } from '../../../app/context'
import { toast } from '../../../ui'

export interface TreeActions {
  reload(): Promise<void>
  restoreExpanded(): void
  toggle(path: string): void
  collapseAll(): void
  selectFolder(path: string): void
  selectNote(noteId: string, path: string): void
  openNote(noteId: string, path: string): void
  createNote(parentPath: string | null): Promise<void>
  createFolder(parentPath: string | null): Promise<void>
  rename(kind: 'folder' | 'note', path: string, noteId: string | null, name: string): Promise<boolean>
  remove(kind: 'folder' | 'note', path: string, noteId: string | null): Promise<boolean>
  moveNote(noteId: string, folderPath: string | null): Promise<void>
  moveFolder(path: string, parentPath: string | null): Promise<void>
  toggleSort(): void
}

const EXPANDED_KEY = 'easynote:expanded'

export interface DragPayload {
  kind: 'folder' | 'note'
  path: string
  noteId: string | null
}

function sortTree(tree: ExplorerState['tree'], asc: boolean): ExplorerState['tree'] {
  const factor = asc ? 1 : -1
  const sortFolders = (folders: ExplorerState['tree']['folders']): ExplorerState['tree']['folders'] =>
    [...folders]
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') * factor)
      .map((folder) => ({
        ...folder,
        notes: [...folder.notes].sort(
          (a, b) => a.title.localeCompare(b.title, 'zh-CN') * factor
        ),
        children: sortFolders(folder.children)
      }))
  return {
    folders: sortFolders(tree.folders),
    notes: [...tree.notes].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN') * factor)
  }
}

export function createTreeActions(ctx: RendererContext, state: ExplorerState): TreeActions {
  const { api, i18n } = ctx

  const persistExpanded = (): void => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...state.expanded]))
    } catch {
      // storage may be unavailable
    }
  }

  const selectNote = (noteId: string, path: string): void => {
    state.selectedPath = path
    state.selectedKind = 'note'
    state.selectedNoteId = asNoteId(noteId)
  }

  const reload = async (): Promise<void> => {
    state.loading = true
    const result = await api.folder.tree()
    state.loading = false
    if (result.ok) state.tree = result.data
  }

  return {
    reload,
    restoreExpanded() {
      try {
        const raw = localStorage.getItem(EXPANDED_KEY)
        if (!raw) return
        const values = JSON.parse(raw) as string[]
        for (const value of values) state.expanded.add(value)
      } catch {
        // ignore corrupt value
      }
    },
    toggle(path) {
      if (state.expanded.has(path)) state.expanded.delete(path)
      else state.expanded.add(path)
      persistExpanded()
    },
    collapseAll() {
      state.expanded.clear()
      persistExpanded()
    },
    selectFolder(path) {
      state.selectedPath = path
      state.selectedKind = 'folder'
      state.selectedNoteId = null
    },
    selectNote,
    openNote(noteId, path) {
      selectNote(noteId, path)
      ctx.workspace.openNote(noteId)
      void api.settings.addRecent(asNoteId(noteId))
    },
    async createNote(parentPath) {
      const result = await api.note.create(parentPath)
      if (!result.ok) {
        toast(i18n.t('menu.error', { message: result.error.message }), 'error')
        return
      }
      await reload()
      const note = result.data
      if (note.folderPath) {
        state.expanded.add(note.folderPath)
        persistExpanded()
      }
      ctx.workspace.openNote(note.id)
    },
    async createFolder(parentPath) {
      const result = await api.folder.create(parentPath, i18n.t('explorer.newFolder'))
      if (result.ok) {
        state.expanded.add(result.data.path)
        persistExpanded()
        await reload()
      }
    },
    async rename(kind, path, noteId, name) {
      if (!name.trim()) return false
      const result =
        kind === 'note' && noteId
          ? await api.note.rename(asNoteId(noteId), name.trim())
          : await api.folder.rename(path, name.trim())
      if (!result.ok) return false
      await reload()
      return true
    },
    async remove(kind, path, noteId) {
      const result =
        kind === 'note' && noteId
          ? await api.note.delete(asNoteId(noteId))
          : await api.folder.delete(path)
      if (!result.ok) return false
      await reload()
      return true
    },
    async moveNote(noteId, folderPath) {
      const result = await api.note.move(asNoteId(noteId), folderPath)
      if (result.ok) await reload()
    },
    async moveFolder(path, parentPath) {
      const result = await api.folder.move(path, parentPath)
      if (result.ok) await reload()
    },
    toggleSort() {
      state.sortAsc = !state.sortAsc
      state.tree = sortTree(state.tree, state.sortAsc)
    }
  }
}
