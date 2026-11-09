import type { IpcResult } from './envelope'

export const WindowChannels = {
  minimize: 'window:minimize',
  toggleMaximize: 'window:toggle-maximize',
  close: 'window:close',
  isMaximized: 'window:is-maximized',
  platform: 'window:platform'
} as const

export interface WindowApi {
  minimize(): Promise<IpcResult<void>>
  toggleMaximize(): Promise<IpcResult<boolean>>
  close(): Promise<IpcResult<void>>
  isMaximized(): Promise<IpcResult<boolean>>
  platform(): Promise<IpcResult<string>>
}
