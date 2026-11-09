import type { FolderApi } from '@shared/contracts/folder'
import { FolderChannels } from '@shared/contracts/folder'
import { invoke } from './invoke'

export const folderApi: FolderApi = {
  tree: () => invoke(FolderChannels.tree),
  create: (parentPath, name) => invoke(FolderChannels.create, { parentPath, name }),
  rename: (path, name) => invoke(FolderChannels.rename, { path, name }),
  move: (path, newParentPath) => invoke(FolderChannels.move, { path, parentPath: newParentPath }),
  delete: (path) => invoke(FolderChannels.delete, path)
}
