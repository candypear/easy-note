// 笔记库文件监听（chokidar）：只上报 .md 文件的增/改/删事件，供索引模块增量更新。
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
      // 用 Promise 把 ready/error 事件转为可 await 的启动结果
      const { promise, resolve, reject } = Promise.withResolvers<void>()
      instance = watch(root, {
        // 跳过启动时的初始扫描，已有文件由全量索引处理，避免重复上报 add
        ignoreInitial: true,
        persistent: true,
        // 忽略应用内部数据目录 .easynote（数据库等），避免自身写入触发事件
        ignored: (path: string) => path.split(/[\\/]/).includes('.easynote'),
        // 防抖：等文件大小稳定 180ms 后才上报，合并编辑器的连续写入，避免读到半截内容
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
