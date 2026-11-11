// 设置模块桥接：把 SettingsApi 调用转发到对应 IPC 通道。
import type { SettingsApi } from '@shared/contracts/settings'
import { SettingsChannels } from '@shared/contracts/settings'
import { invoke } from './invoke'

export const settingsApi: SettingsApi = {
  get: () => invoke(SettingsChannels.get),
  set: (patch) => invoke(SettingsChannels.set, patch),
  addRecent: (noteId) => invoke(SettingsChannels.addRecent, { noteId }),
  rebuildIndex: () => invoke(SettingsChannels.rebuildIndex)
}
