import type { FolderId } from '../types/brand'
import type { NoteSummary } from './note'
import type { IpcResult } from './envelope'

export interface FolderDTO {
  id: FolderId
  name: string
  path: string
  parentPath: string | null
  sortOrder: number
}

export interface FolderNode extends FolderDTO {
  children: FolderNode[]
  notes: NoteSummary[]
}

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
  delete(path: string): Promise<IpcResult<{ trashedNotes: number }>>
}
