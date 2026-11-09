import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, stat, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function writeAtomic(target: string, content: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.${randomUUID()}.tmp`
  const handle = await open(temporary, 'w')
  try {
    await handle.writeFile(content, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}
