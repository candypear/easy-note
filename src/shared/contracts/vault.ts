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
  suggestPath(): Promise<IpcResult<string>>
  pickFolder(): Promise<IpcResult<string | null>>
  open(path: string): Promise<IpcResult<VaultInfo>>
  current(): Promise<IpcResult<VaultInfo | null>>
}
