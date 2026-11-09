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
