import { Menu } from 'electron'

export function removeNativeMenu(): void {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
}
