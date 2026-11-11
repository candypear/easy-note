// 窗口控制桥接：把 WindowApi 调用转发到对应 IPC 通道，供自绘标题栏使用。
import type { WindowApi } from '@shared/contracts/window'
import { WindowChannels } from '@shared/contracts/window'
import { invoke } from './invoke'

export const windowApi: WindowApi = {
  minimize: () => invoke(WindowChannels.minimize),
  toggleMaximize: () => invoke(WindowChannels.toggleMaximize),
  close: () => invoke(WindowChannels.close),
  isMaximized: () => invoke(WindowChannels.isMaximized),
  platform: () => invoke(WindowChannels.platform)
}
