import { nativeTheme } from 'electron'
import type { ThemeMode } from '@shared/contracts/settings'

export interface ThemePort {
  isDark(): boolean
  setMode(mode: ThemeMode): void
  onChange(callback: (theme: 'light' | 'dark') => void): () => void
}

export function createThemePort(): ThemePort {
  return {
    isDark: () => nativeTheme.shouldUseDarkColors,
    setMode(mode) {
      nativeTheme.themeSource = mode
    },
    onChange(callback) {
      const listener = (): void => callback(nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
      nativeTheme.on('updated', listener)
      return () => nativeTheme.off('updated', listener)
    }
  }
}
