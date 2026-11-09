import { reactive } from 'vue'
import type { FolderNode, FolderTree } from '@shared/contracts/folder'
import type { NoteId } from '@shared/types/brand'

export interface ExplorerState {
  tree: FolderTree
  loading: boolean
  expanded: Set<string>
  selectedPath: string | null
  selectedKind: 'folder' | 'note' | null
  selectedNoteId: NoteId | null
  sortAsc: boolean
}

export function createExplorerState(): ExplorerState {
  return reactive<ExplorerState>({
    tree: { folders: [], notes: [] },
    loading: false,
    expanded: new Set<string>(),
    selectedPath: null,
    selectedKind: null,
    selectedNoteId: null,
    sortAsc: true
  })
}

export function countNotes(folder: FolderNode): number {
  let count = folder.notes.length
  for (const child of folder.children) count += countNotes(child)
  return count
}
