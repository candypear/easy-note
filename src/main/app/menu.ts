// 应用菜单管理：非 macOS 平台移除原生菜单栏，界面完全由渲染进程自绘。
import { Menu } from 'electron'

export function removeNativeMenu(): void {
  // macOS 需保留应用菜单以维持系统级快捷键（复制/粘贴/退出等），故仅其他平台移除
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
}
