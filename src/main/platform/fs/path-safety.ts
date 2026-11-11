// 路径安全与相对路径工具：所有路径先 resolve 归一化再校验，防止 ../ 路径穿越逃逸笔记库。
// 库内统一使用 POSIX 风格（/）相对路径，保证跨平台一致性。
import { isAbsolute, relative, resolve } from 'node:path'
import { AppError } from '../errors'

export function toPosix(value: string): string {
  return value.replace(/\\/g, '/')
}

// 把库内相对路径解析为绝对路径；resolve 会消解 ../ 与 .，再校验结果仍在库内
export function resolveInVault(root: string, relativePath: string): string {
  const target = resolve(root, relativePath)
  assertInside(root, target)
  return target
}

// 校验 target 位于 root 内：相对路径以 .. 开头或为绝对路径（如 Windows 跨盘符）即越界
export function assertInside(root: string, target: string): void {
  const rel = relative(resolve(root), resolve(target))
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new AppError('PATH_OUTSIDE_VAULT')
  }
}

// 绝对路径转库内相对路径（POSIX 风格），同样拒绝库外路径
export function vaultRelative(root: string, absolutePath: string): string {
  const rel = relative(resolve(root), resolve(absolutePath))
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new AppError('PATH_OUTSIDE_VAULT')
  }
  return toPosix(rel)
}

// Windows 保留设备名（不区分大小写），不能用作文件名
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

// 清洗用户输入的文件名：去掉跨平台非法字符与控制字符、结尾的点和空格（Windows 不允许），
// 空名或保留名回退为"未命名"，并截断到 80 字符防止超出文件系统长度限制
export function sanitizeName(input: string): string {
  const cleaned = input
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
  if (!cleaned || RESERVED.test(cleaned)) return '未命名'
  return cleaned.slice(0, 80)
}

// 重名时追加 " 2"、" 3" 等序号生成不冲突的路径；exists 由调用方注入以便同步判断
export function uniquePath(
  exists: (path: string) => boolean,
  directory: string,
  base: string,
  extension = ''
): string {
  const separator = directory && directory !== '.' ? '/' : ''
  const first = `${directory}${separator}${base}${extension}`
  if (!exists(first)) return first
  let index = 2
  while (exists(`${directory}${separator}${base} ${index}${extension}`)) index += 1
  return `${directory}${separator}${base} ${index}${extension}`
}

// 归一化外部传入的相对路径：统一分隔符并去掉 ./ 前缀与首尾斜杠
export function normalizeRelative(value: string | null | undefined): string {
  if (!value) return ''
  return toPosix(value)
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

export function parentPathOf(path: string): string {
  const posix = toPosix(path)
  const index = posix.lastIndexOf('/')
  return index <= 0 ? '' : posix.slice(0, index)
}

export function baseName(path: string): string {
  const posix = toPosix(path)
  const index = posix.lastIndexOf('/')
  return index < 0 ? posix : posix.slice(index + 1)
}

export function titleFromPath(path: string): string {
  return baseName(path).replace(/\.md$/i, '')
}
