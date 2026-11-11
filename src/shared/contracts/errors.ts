// IPC 错误码与错误结构：渲染端按 code 分类处理（提示、重试或引导用户），message 仅作展示。
// 分类约定：VAULT_* 库级（未就绪/无效/写保护/打开失败）；NOTE_/FOLDER_/BLOCK_/TAG_ 资源级
//（不存在或命名冲突）；PATH_OUTSIDE_VAULT/INVALID_REQUEST 请求非法；其余为文件系统/索引/内部故障。
export type ErrorCode =
  | 'VAULT_NOT_READY'
  | 'VAULT_INVALID'
  | 'VAULT_WRITE_DENIED'
  | 'VAULT_OPEN_FAILED'
  | 'NOTE_NOT_FOUND'
  | 'NOTE_CONFLICT'
  | 'FOLDER_NOT_FOUND'
  | 'FOLDER_CONFLICT'
  | 'BLOCK_NOT_FOUND'
  | 'TAG_NOT_FOUND'
  | 'PATH_OUTSIDE_VAULT'
  | 'INVALID_REQUEST'
  | 'TRASH_UNAVAILABLE'
  | 'FILE_READ_FAILED'
  | 'FILE_WRITE_FAILED'
  | 'INDEX_FAILED'
  | 'SEARCH_FAILED'
  | 'INTERNAL'

export interface IpcError {
  code: ErrorCode
  message: string
}
