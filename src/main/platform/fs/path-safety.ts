import { isAbsolute, relative, resolve } from 'node:path'
import { AppError } from '../errors'

export function toPosix(value: string): string {
  return value.replace(/\\/g, '/')
}

export function resolveInVault(root: string, relativePath: string): string {
  const target = resolve(root, relativePath)
  assertInside(root, target)
  return target
}

export function assertInside(root: string, target: string): void {
  const rel = relative(resolve(root), resolve(target))
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new AppError('PATH_OUTSIDE_VAULT')
  }
}

export function vaultRelative(root: string, absolutePath: string): string {
  const rel = relative(resolve(root), resolve(absolutePath))
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new AppError('PATH_OUTSIDE_VAULT')
  }
  return toPosix(rel)
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export function sanitizeName(input: string): string {
  const cleaned = input
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
  if (!cleaned || RESERVED.test(cleaned)) return '未命名'
  return cleaned.slice(0, 80)
}

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
