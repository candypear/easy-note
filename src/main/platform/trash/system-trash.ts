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
