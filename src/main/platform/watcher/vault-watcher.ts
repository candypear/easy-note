import { watch, type FSWatcher } from 'chokidar'
import { AppError } from '../errors'

export type WatchEventType = 'add' | 'change' | 'unlink'
export type WatchCallback = (type: WatchEventType, absolutePath: string) => void

export interface WatcherPort {
  start(root: string, callback: WatchCallback): Promise<void>
  stop(): Promise<void>
}

export function createWatcher(): WatcherPort {
  let instance: FSWatcher | null = null

  return {
    async start(root, callback) {
      const { promise, resolve, reject } = Promise.withResolvers<void>()
      instance = watch(root, {
        ignoreInitial: true,
        persistent: true,
        ignored: (path: string) => path.split(/[\\/]/).includes('.easynote'),
        awaitWriteFinish: { stabilityThreshold: 180, pollInterval: 40 }
      })
      instance.on('ready', () => resolve())
      instance.on('error', (error) => reject(new AppError('INDEX_FAILED', String(error))))
      instance.on('add', (path) => {
        if (path.endsWith('.md')) callback('add', path)
      })
      instance.on('change', (path) => {
        if (path.endsWith('.md')) callback('change', path)
      })
      instance.on('unlink', (path) => {
        if (path.endsWith('.md')) callback('unlink', path)
      })
      await promise
    },
    async stop() {
      if (!instance) return
      await instance.close()
      instance = null
    }
  }
}
