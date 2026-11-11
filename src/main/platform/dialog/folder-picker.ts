// 系统文件夹选择对话框封装：向上层提供统一的选目录端口，屏蔽 Electron dialog 细节。
import { dialog } from 'electron'

export interface DialogPort {
  pickFolder(title: string): Promise<string | null>
}

export function createDialog(): DialogPort {
  return {
    async pickFolder(title) {
      const result = await dialog.showOpenDialog({
        title,
        properties: ['openDirectory', 'createDirectory']
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    }
  }
}
