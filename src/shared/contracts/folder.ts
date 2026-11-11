// 文件夹模块契约：文件夹 DTO、资源树结构与 IPC 通道/API 定义。
import type { FolderId } from '../types/brand'
import type { NoteSummary } from './note'
import type { IpcResult } from './envelope'

export interface FolderDTO {
  id: FolderId
  name: string
  // 相对库根的路径；parentPath 为 null 表示位于库根
  path: string
  parentPath: string | null
  sortOrder: number
}

// 递归树节点：子文件夹与直属笔记
export interface FolderNode extends FolderDTO {
  children: FolderNode[]
  notes: NoteSummary[]
}

// 整库资源树；notes 为库根下不属于任何文件夹的笔记
export interface FolderTree {
  folders: FolderNode[]
  notes: NoteSummary[]
}

export const FolderChannels = {
  tree: 'folder:tree',
  create: 'folder:create',
  rename: 'folder:rename',
  move: 'folder:move',
  delete: 'folder:delete'
} as const

export interface FolderApi {
  tree(): Promise<IpcResult<FolderTree>>
  create(parentPath: string | null, name: string): Promise<IpcResult<FolderDTO>>
  rename(path: string, name: string): Promise<IpcResult<FolderDTO>>
  move(path: string, newParentPath: string | null): Promise<IpcResult<FolderDTO>>
  // 删除走回收站，返回被一并移入回收站的笔记数
  delete(path: string): Promise<IpcResult<{ trashedNotes: number }>>
}
