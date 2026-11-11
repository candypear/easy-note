// 平台层统一错误类型：AppError 携带错误码，供 IPC 层映射为结构化错误返回渲染进程。
// FALLBACK 为每个错误码提供默认中文文案，保证任何错误都有可展示的提示。
import type { ErrorCode } from '@shared/contracts/errors'

const FALLBACK: Record<ErrorCode, string> = {
  VAULT_NOT_READY: '尚未选择笔记库',
  VAULT_INVALID: '笔记库路径无效',
  VAULT_WRITE_DENIED: '无法写入该文件夹',
  VAULT_OPEN_FAILED: '无法打开笔记库',
  NOTE_NOT_FOUND: '笔记不存在',
  NOTE_CONFLICT: '已存在同名笔记',
  FOLDER_NOT_FOUND: '文件夹不存在',
  FOLDER_CONFLICT: '已存在同名文件夹',
  BLOCK_NOT_FOUND: '块不存在',
  TAG_NOT_FOUND: '标签不存在',
  PATH_OUTSIDE_VAULT: '路径超出笔记库范围',
  INVALID_REQUEST: '请求参数无效',
  TRASH_UNAVAILABLE: '当前系统不支持回收站',
  FILE_READ_FAILED: '读取文件失败',
  FILE_WRITE_FAILED: '写入文件失败',
  INDEX_FAILED: '建立索引失败',
  SEARCH_FAILED: '搜索失败',
  INTERNAL: '内部错误'
}

export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message = FALLBACK[code]) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export const errorMessage = (code: ErrorCode): string => FALLBACK[code]
