// 文件树动作集：增删改/移动/排序都经 API 委托主进程，成功后整树重载；
// 展开状态持久化到 localStorage，跨会话保留浏览位置。
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

// 纯函数排序：按中文 locale 递归比较名称/标题，factor 控制升降序；
// 全程拷贝数组与节点，不改动主进程返回的原始树结构
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
      // localStorage 可能不可用（隐私模式/配额），静默降级为不持久化
    }
  }

  const selectNote = (noteId: string, path: string): void => {
    state.selectedPath = path
    state.selectedKind = 'note'
    state.selectedNoteId = asNoteId(noteId)
  }

  const reload = async (): Promise<void> => {
    // 一次性拉取整棵目录树；子节点在展开时才渲染（懒渲染而非按需加载数据）
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
        // 存储值损坏时忽略，按全部折叠处理
      }
    },
    toggle(path) {
      // 每次展开/折叠立即持久化，保证下次启动还原浏览位置
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
      // 选中态、工作区打开、最近列表三处联动；最近列表写入失败不影响打开
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
      // 展开新笔记所在文件夹并直接打开，让用户立即看到并编辑新文件
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
      // 笔记按 id 走 note API、文件夹按路径走 folder API；
      // 返回布尔值交由调用方（行内编辑）决定是否提示失败
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
      // 拖拽移动：仅成功才重载，失败保持原树不动（主进程负责合法性校验）
      const result = await api.note.move(asNoteId(noteId), folderPath)
      if (result.ok) await reload()
    },
    async moveFolder(path, parentPath) {
      const result = await api.folder.move(path, parentPath)
      if (result.ok) await reload()
    },
    toggleSort() {
      // 只在内存中重排当前树，不重新请求主进程
      state.sortAsc = !state.sortAsc
      state.tree = sortTree(state.tree, state.sortAsc)
    }
  }
}
