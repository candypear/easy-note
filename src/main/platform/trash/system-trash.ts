// 系统回收站端口：走 Electron shell.trashItem，各平台由系统实现（Windows 回收站 / macOS 废纸篓 /
// Linux freedesktop 回收站）；部分环境（如无桌面服务的 Linux）不支持时统一抛 TRASH_UNAVAILABLE。
import { shell } from 'electron'
import { AppError } from '../errors'

export interface TrashPort {
  trash(absolutePath: string): Promise<void>
}

export function createTrash(): TrashPort {
  return {
    async trash(absolutePath) {
      try {
        await shell.trashItem(absolutePath)
      } catch {
        throw new AppError('TRASH_UNAVAILABLE')
      }
    }
  }
}
