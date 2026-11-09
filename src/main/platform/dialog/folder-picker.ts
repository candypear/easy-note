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
