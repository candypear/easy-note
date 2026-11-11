// 原子文件写入：先写临时文件再 rename 覆盖目标，避免写入中途崩溃/断电留下半截文件。
import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, stat, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function writeAtomic(target: string, content: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  // 随机后缀避免并发写同一目标时临时文件互相覆盖；同目录保证 rename 不跨文件系统
  const temporary = `${target}.${randomUUID()}.tmp`
  const handle = await open(temporary, 'w')
  try {
    await handle.writeFile(content, 'utf8')
    // fsync 确保数据落盘后再 rename，否则崩溃时可能出现空目标文件
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    // rename 在同一文件系统上是原子操作：读者只会看到旧内容或完整新内容
    await rename(temporary, target)
  } catch (error) {
    // rename 失败时清理临时文件（清理失败忽略），原目标文件保持不动
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
