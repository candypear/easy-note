// 笔记库（vault）契约：库信息 DTO 与打开/查询库的 IPC 通道/API。
import type { IpcResult } from './envelope'

export interface VaultInfo {
  id: string
  path: string
  name: string
  openedAt: string
}

export const VaultChannels = {
  suggestPath: 'vault:suggest-path',
  pickFolder: 'vault:pick-folder',
  open: 'vault:open',
  current: 'vault:current'
} as const

export interface VaultApi {
  // 返回默认建议的库目录（尚未创建）
  suggestPath(): Promise<IpcResult<string>>
  // 弹系统目录选择框；用户取消时 data 为 null
  pickFolder(): Promise<IpcResult<string | null>>
  open(path: string): Promise<IpcResult<VaultInfo>>
  // 当前已打开的库；未打开任何库时为 null
  current(): Promise<IpcResult<VaultInfo | null>>
}
