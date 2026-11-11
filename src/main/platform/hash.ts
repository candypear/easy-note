// 文本哈希工具：计算 UTF-8 字符串的 SHA-256，用于内容比对（如判断文件是否变化）。
import { createHash } from 'node:crypto'

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}
