// 主进程文件日志：追加写入 userData/logs/main.log，供排查问题使用。
import { mkdir, appendFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface LoggerPort {
  info(message: string): void
  error(message: string, error?: unknown): void
}

export function createLogger(userData: string): LoggerPort {
  const dir = join(userData, 'logs')
  const file = join(dir, 'main.log')
  let ready: Promise<void> | null = null

  // 异步"发射后不管"式写入：不阻塞调用方；目录只创建一次（缓存 Promise），
  // 写入失败静默忽略——日志本身不能影响主流程
  const write = (level: string, message: string): void => {
    const dirReady = (ready ??= mkdir(dir, { recursive: true }).then(() => undefined))
    void dirReady
      .then(() =>
        appendFile(file, `${new Date().toISOString()} [${level}] ${message}\n`, 'utf8')
      )
      .catch(() => undefined)
  }

  return {
    info(message) {
      write('INFO', message)
    },
    error(message, error) {
      write('ERROR', error ? `${message}: ${String(error)}` : message)
    }
  }
}
