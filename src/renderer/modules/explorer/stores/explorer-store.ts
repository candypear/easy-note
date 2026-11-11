// 文件树状态工厂：目录树数据、展开集合、选中项与排序方向；
// 每个 FileTree 实例独立创建一份 reactive 状态，不做全局单例。
import { reactive } from 'vue'
import type { FolderNode, FolderTree } from '@shared/contracts/folder'
import type { NoteId } from '@shared/types/brand'

export interface ExplorerState {
  tree: FolderTree
  loading: boolean
  // 展开状态按文件夹路径记录（Set），与树数据解耦，重载树后仍能保留
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

// 递归统计文件夹（含子文件夹）内的笔记总数，用于删除确认文案
export function countNotes(folder: FolderNode): number {
  let count = folder.notes.length
  for (const child of folder.children) count += countNotes(child)
  return count
}
