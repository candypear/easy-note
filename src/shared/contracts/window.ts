// 窗口控制契约：自绘标题栏所需的最小化/最大化/关闭与平台查询的 IPC 通道/API。
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
  // 返回切换后的最大化状态
  toggleMaximize(): Promise<IpcResult<boolean>>
  close(): Promise<IpcResult<void>>
  isMaximized(): Promise<IpcResult<boolean>>
  // 返回 process.platform（如 win32/darwin），用于按平台摆放窗口按钮
  platform(): Promise<IpcResult<string>>
}
