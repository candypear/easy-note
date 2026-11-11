// 设置模块契约：设置 DTO、可写字段子集与 IPC 通道/API。
import type { NoteId } from '../types/brand'
import type { IpcResult } from './envelope'

export type ThemeMode = 'light' | 'dark' | 'system'
export type FontSize = 14 | 16 | 18

export interface SettingsDTO {
  theme: ThemeMode
  fontSize: FontSize
  vaultPath: string | null
  sidebarWidth: number
  rightWidth: number
  sidebarOpen: boolean
  rightOpen: boolean
  // 最近打开的笔记，按时间倒序，由主进程维护
  recentNoteIds: NoteId[]
  // 上次全量索引完成时间（ISO）；null 表示尚未索引
  lastIndexedAt: string | null
}

// 只允许渲染端修改这些字段；recentNoteIds/lastIndexedAt 由主进程内部维护，不开放写入
export type SettingsPatch = Partial<
  Pick<
    SettingsDTO,
    | 'theme'
    | 'fontSize'
    | 'vaultPath'
    | 'sidebarWidth'
    | 'rightWidth'
    | 'sidebarOpen'
    | 'rightOpen'
  >
>

export interface RebuildIndexResult {
  indexed: number
}

export const SettingsChannels = {
  get: 'settings:get',
  set: 'settings:set',
  addRecent: 'settings:add-recent',
  rebuildIndex: 'settings:rebuild-index'
} as const

export interface SettingsApi {
  get(): Promise<IpcResult<SettingsDTO>>
  set(patch: SettingsPatch): Promise<IpcResult<SettingsDTO>>
  addRecent(noteId: NoteId): Promise<IpcResult<SettingsDTO>>
  rebuildIndex(): Promise<IpcResult<RebuildIndexResult>>
}
