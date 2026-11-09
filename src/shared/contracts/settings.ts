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
  recentNoteIds: NoteId[]
  lastIndexedAt: string | null
}

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
