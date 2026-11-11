// 系统主题端口：封装 Electron nativeTheme，提供深浅色查询、模式设置与变化订阅。
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
      // 返回取消订阅函数，便于调用方在销毁时解绑监听
      return () => nativeTheme.off('updated', listener)
    }
  }
}
