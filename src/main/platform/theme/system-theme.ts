import { nativeTheme } from 'electron'

export interface ThemePort {
  isDark(): boolean
  onChange(callback: (theme: 'light' | 'dark') => void): () => void
}

export function createThemePort(): ThemePort {
  return {
    isDark: () => nativeTheme.shouldUseDarkColors,
    onChange(callback) {
      const listener = (): void => callback(nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
      nativeTheme.on('updated', listener)
      return () => nativeTheme.off('updated', listener)
    }
  }
}
