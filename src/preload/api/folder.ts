// 文件夹模块桥接：把 FolderApi 调用转发到对应 IPC 通道。
import type { FolderApi } from '@shared/contracts/folder'
import { FolderChannels } from '@shared/contracts/folder'
import { invoke } from './invoke'

export const folderApi: FolderApi = {
  tree: () => invoke(FolderChannels.tree),
  create: (parentPath, name) => invoke(FolderChannels.create, { parentPath, name }),
  rename: (path, name) => invoke(FolderChannels.rename, { path, name }),
  // 主进程 handler 约定的字段名是 parentPath，这里做参数名映射
  move: (path, newParentPath) => invoke(FolderChannels.move, { path, parentPath: newParentPath }),
  delete: (path) => invoke(FolderChannels.delete, path)
}
