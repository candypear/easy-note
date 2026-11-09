import { copyFile, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { writeAtomic } from './atomic-write'

export interface DirEntry {
  name: string
  isDirectory: boolean
  isFile: boolean
}

export interface StatInfo {
  mtimeMs: number
  size: number
  isDirectory: boolean
  isFile: boolean
}

export interface FileSystemPort {
  readFile(path: string): Promise<string>
  writeFileAtomic(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  stat(path: string): Promise<StatInfo>
  mkdirp(path: string): Promise<void>
  readdir(path: string): Promise<DirEntry[]>
  rename(from: string, to: string): Promise<void>
  copy(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
}

const toStat = (value: Stats): StatInfo => ({
  mtimeMs: value.mtimeMs,
  size: value.size,
  isDirectory: value.isDirectory(),
  isFile: value.isFile()
})

export function createFileSystem(): FileSystemPort {
  return {
    readFile: (path) => readFile(path, 'utf8'),
    writeFileAtomic: writeAtomic,
    async exists(path) {
      try {
        await stat(path)
        return true
      } catch {
        return false
      }
    },
    async stat(path) {
      return toStat(await stat(path))
    },
    async mkdirp(path) {
      await mkdir(path, { recursive: true })
    },
    async readdir(path) {
      const entries = await readdir(path, { withFileTypes: true })
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile()
      }))
    },
    async rename(from, to) {
      await rename(from, to)
    },
    async copy(from, to) {
      await copyFile(from, to)
    },
    async remove(path) {
      await rm(path, { recursive: true, force: true })
    }
  }
}
