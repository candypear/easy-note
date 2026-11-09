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
