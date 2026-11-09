import { join } from 'node:path'
import { nanoid } from 'nanoid'
import type { MainContext, MainModule } from '@main/bootstrap/types'
import type { FolderDTO, FolderNode, FolderTree } from '@shared/contracts/folder'
import { FolderChannels } from '@shared/contracts/folder'
import type { FolderId } from '@shared/types/brand'
import { asFolderId } from '@shared/types/brand'
import { AppError } from '@main/platform/errors'
import {
  baseName,
  normalizeRelative,
  resolveInVault,
  sanitizeName,
  vaultRelative
} from '@main/platform/fs/path-safety'
import { escapeLike, likePrefix } from '@main/platform/sql-like'
import type { SqliteDatabase } from '@main/platform/sqlite/connection'

interface FolderRow {
  id: string
  parent_id: string | null
  name: string
  path: string
  sort_order: number
}

class FolderRepository {
  constructor(private readonly db: SqliteDatabase) {}

  all(): FolderRow[] {
    return this.db
      .prepare<FolderRow>('SELECT id, parent_id, name, path, sort_order FROM folders ORDER BY name')
      .all()
  }

  byPath(path: string): FolderRow | null {
    return (
      this.db
        .prepare<FolderRow>(
          'SELECT id, parent_id, name, path, sort_order FROM folders WHERE path = ?'
        )
        .get(path) ?? null
    )
  }

  insert(row: FolderRow): void {
    this.db
      .prepare('INSERT INTO folders (id, parent_id, name, path, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(row.id, row.parent_id, row.name, row.path, row.sort_order)
  }

  update(row: FolderRow): void {
    this.db
      .prepare('UPDATE folders SET parent_id = ?, name = ?, path = ?, sort_order = ? WHERE id = ?')
      .run(row.parent_id, row.name, row.path, row.sort_order, row.id)
  }

  removeByPrefix(prefix: string): void {
    this.db
      .prepare("DELETE FROM folders WHERE path = ? OR path LIKE ? ESCAPE '\\'")
      .run(prefix, likePrefix(prefix))
  }

  removeMissing(paths: string[]): void {
    if (paths.length === 0) return
    const placeholders = paths.map(() => '?').join(', ')
    this.db.prepare(`DELETE FROM folders WHERE path IN (${placeholders})`).run(...paths)
  }
}

export class FolderService {
  private repository: FolderRepository | null = null

  constructor(private readonly ctx: MainContext) {}

  private requireRoot(): { root: string; repository: FolderRepository } {
    const root = this.ctx.services.vault.root
    if (!root) throw new AppError('VAULT_NOT_READY')
    this.repository ??= new FolderRepository(this.ctx.db)
    return { root, repository: this.repository }
  }

  async tree(): Promise<FolderTree> {
    await this.syncFromDisk()
    const { repository } = this.requireRoot()
    const rows = repository.all()
    const nodes = new Map<string, FolderNode>()
    for (const row of rows) {
      nodes.set(row.path, {
        id: asFolderId(row.id),
        name: row.name,
        path: row.path,
        parentPath: row.parent_id ? this.pathOfId(rows, row.parent_id) : null,
        sortOrder: row.sort_order,
        children: [],
        notes: []
      })
    }
    const roots: FolderNode[] = []
    for (const node of nodes.values()) {
      const parent = node.parentPath ? nodes.get(node.parentPath) : null
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
    const notes = await this.ctx.services.note.listAll()
    const rootNotes = notes.filter((note) => note.folderPath === '')
    for (const note of notes) {
      const node = note.folderPath ? nodes.get(note.folderPath) : null
      if (node) node.notes.push(note)
    }
    const sortNodes = (items: FolderNode[]): void => {
      items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      for (const item of items) {
        item.notes.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
        sortNodes(item.children)
      }
    }
    sortNodes(roots)
    rootNotes.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    return { folders: roots, notes: rootNotes }
  }

  private pathOfId(rows: FolderRow[], id: string): string | null {
    return rows.find((row) => row.id === id)?.path ?? null
  }

  async create(parentPath: string | null, name: string): Promise<FolderDTO> {
    const { root, repository } = this.requireRoot()
    const parent = normalizeRelative(parentPath)
    if (parent) await this.ensureExists(parent)
    const parentAbsolute = parent ? resolveInVault(root, parent) : root
    const clean = sanitizeName(name || '新建文件夹')
    const target = await this.uniqueFolder(parentAbsolute, clean)
    await this.ctx.fs.mkdirp(target)
    await this.syncFromDisk()
    const relative = vaultRelative(root, target)
    const row = repository.byPath(relative)
    if (!row) throw new AppError('FOLDER_NOT_FOUND')
    this.ctx.events.publish('folder:changed', { folderId: row.id })
    return this.toDto(row)
  }

  async rename(path: string, name: string): Promise<FolderDTO> {
    const { root, repository } = this.requireRoot()
    const relative = normalizeRelative(path)
    const row = repository.byPath(relative)
    if (!row) throw new AppError('FOLDER_NOT_FOUND')
    const clean = sanitizeName(name)
    if (clean === row.name) return this.toDto(row)
    const parentAbsolute = relative.includes('/')
      ? resolveInVault(root, relative.slice(0, relative.lastIndexOf('/')))
      : root
    const target = await this.uniqueFolder(parentAbsolute, clean)
    const oldAbsolute = resolveInVault(root, relative)
    await this.ctx.fs.rename(oldAbsolute, target)
    const newRelative = vaultRelative(root, target)
    await this.rebasePath(relative, newRelative, clean)
    this.ctx.events.publish('folder:changed', { folderId: row.id })
    return { ...this.toDto(row), name: clean, path: newRelative }
  }

  async move(path: string, newParentPath: string | null): Promise<FolderDTO> {
    const { root, repository } = this.requireRoot()
    const relative = normalizeRelative(path)
    if (!relative) throw new AppError('INVALID_REQUEST')
    const row = repository.byPath(relative)
    if (!row) throw new AppError('FOLDER_NOT_FOUND')
    const parent = normalizeRelative(newParentPath)
    if (parent === relative || parent.startsWith(`${relative}/`)) {
      throw new AppError('INVALID_REQUEST', '不能把文件夹移动到自身内部')
    }
    if (parent) await this.ensureExists(parent)
    const parentAbsolute = parent ? resolveInVault(root, parent) : root
    const target = await this.uniqueFolder(parentAbsolute, row.name)
    if (resolveInVault(root, relative) === target) return this.toDto(row)
    await this.ctx.fs.rename(resolveInVault(root, relative), target)
    const newRelative = vaultRelative(root, target)
    await this.rebasePath(relative, newRelative, row.name)
    this.ctx.events.publish('folder:changed', { folderId: row.id })
    return { ...this.toDto(row), path: newRelative, parentPath: parent || null }
  }

  async delete(path: string): Promise<{ trashedNotes: number }> {
    const { root, repository } = this.requireRoot()
    const relative = normalizeRelative(path)
    if (!relative) throw new AppError('INVALID_REQUEST')
    const row = repository.byPath(relative)
    if (!row) throw new AppError('FOLDER_NOT_FOUND')
    const notes = await this.ctx.services.note.listByPrefix(relative)
    await this.ctx.trash.trash(resolveInVault(root, relative))
    repository.removeByPrefix(relative)
    await this.ctx.services.note.deleteRecordsByPrefix(relative)
    await this.ctx.services.link.resolveAll()
    this.ctx.events.publish('folder:changed', { folderId: row.id })
    return { trashedNotes: notes.length }
  }

  async ensureExists(path: string): Promise<void> {
    const { root } = this.requireRoot()
    const relative = normalizeRelative(path)
    if (!relative) return
    const absolute = resolveInVault(root, relative)
    const stat = await this.ctx.fs.stat(absolute).catch(() => null)
    if (!stat?.isDirectory) throw new AppError('FOLDER_NOT_FOUND')
  }

  folderIdForPath(path: string): FolderId | null {
    if (!this.ctx.services.vault.root) return null
    const row = new FolderRepository(this.ctx.db).byPath(normalizeRelative(path))
    return row ? asFolderId(row.id) : null
  }

  async syncFromDisk(): Promise<void> {
    const { root, repository } = this.requireRoot()
    const scanned: { path: string; name: string; parentPath: string }[] = []
    const walk = async (directory: string, parentPath: string): Promise<void> => {
      const entries = await this.ctx.fs.readdir(directory)
      for (const entry of entries) {
        if (!entry.isDirectory || entry.name.startsWith('.')) continue
        const relative = parentPath ? `${parentPath}/${entry.name}` : entry.name
        scanned.push({ path: relative, name: entry.name, parentPath })
        await walk(join(directory, entry.name), relative)
      }
    }
    await walk(root, '')
    const existing = new Map(repository.all().map((row) => [row.path, row]))
    const seen = new Set<string>()
    this.ctx.db.transaction(() => {
      for (const folder of scanned) {
        seen.add(folder.path)
        const current = existing.get(folder.path)
        const parentId = folder.parentPath ? (existing.get(folder.parentPath)?.id ?? null) : null
        if (current) {
          if (current.name !== folder.name || current.parent_id !== parentId) {
            repository.update({ ...current, name: folder.name, parent_id: parentId })
          }
        } else {
          const row = {
            id: nanoid(12),
            parent_id: parentId,
            name: folder.name,
            path: folder.path,
            sort_order: 0
          }
          repository.insert(row)
          existing.set(folder.path, row)
        }
      }
      const missing = [...existing.keys()].filter((path) => !seen.has(path))
      repository.removeMissing(missing)
    })
  }

  private async rebasePath(oldPrefix: string, newPrefix: string, newName: string): Promise<void> {
    const { repository } = this.requireRoot()
    const rows = repository
      .all()
      .filter((row) => row.path === oldPrefix || row.path.startsWith(`${oldPrefix}/`))
    const parentPath = newPrefix.includes('/') ? newPrefix.slice(0, newPrefix.lastIndexOf('/')) : ''
    const parentId = parentPath ? (repository.byPath(parentPath)?.id ?? null) : null
    this.ctx.db.transaction(() => {
      for (const row of rows) {
        const suffix = row.path.slice(oldPrefix.length)
        const nextPath = `${newPrefix}${suffix}`
        repository.update({
          ...row,
          path: nextPath,
          parent_id: row.path === oldPrefix ? parentId : row.parent_id,
          name: row.path === oldPrefix ? newName : row.name
        })
      }
    })
    await this.ctx.services.note.rebasePaths(oldPrefix, newPrefix)
    this.ctx.services.indexer.rebasePaths(oldPrefix, newPrefix)
    await this.ctx.services.note.reindexPrefix(newPrefix)
  }

  private async uniqueFolder(parentAbsolute: string, name: string): Promise<string> {
    let candidate = join(parentAbsolute, name)
    let index = 2
    while (await this.ctx.fs.exists(candidate)) {
      candidate = join(parentAbsolute, `${name} ${index}`)
      index += 1
    }
    return candidate
  }

  private toDto(row: FolderRow): FolderDTO {
    return {
      id: asFolderId(row.id),
      name: row.name,
      path: row.path,
      parentPath: row.parent_id ? this.parentPath(row) : null,
      sortOrder: row.sort_order
    }
  }

  private parentPath(row: FolderRow): string | null {
    if (!row.parent_id) return null
    const parent = new FolderRepository(this.ctx.db)
      .all()
      .find((item) => item.id === row.parent_id)
    return parent?.path ?? null
  }
}

export interface FolderModule extends MainModule {
  service: FolderService
}

export const folderMigrations = [
  {
    id: 'folder@1',
    up(db: SqliteDatabase) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS folders (
          id TEXT PRIMARY KEY NOT NULL,
          parent_id TEXT,
          name TEXT NOT NULL,
          path TEXT NOT NULL UNIQUE,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
      `)
    }
  }
]

export function createFolderModule(ctx: MainContext): FolderModule {
  const service = new FolderService(ctx)
  return {
    id: 'folder',
    migrations: folderMigrations,
    service,
    registerIpc(ipc) {
      ipc.handle(FolderChannels.tree, () => service.tree())
      ipc.handle(FolderChannels.create, async (payload) => {
        if (!payload || typeof payload !== 'object' || !('name' in payload)) {
          throw new AppError('INVALID_REQUEST')
        }
        const parent = 'parentPath' in payload ? payload.parentPath : null
        return service.create(
          typeof parent === 'string' ? parent : null,
          String(payload.name)
        )
      })
      ipc.handle(FolderChannels.rename, async (payload) => {
        if (!payload || typeof payload !== 'object' || !('path' in payload) || !('name' in payload)) {
          throw new AppError('INVALID_REQUEST')
        }
        return service.rename(String(payload.path), String(payload.name))
      })
      ipc.handle(FolderChannels.move, async (payload) => {
        if (!payload || typeof payload !== 'object' || !('path' in payload)) {
          throw new AppError('INVALID_REQUEST')
        }
        const parent = 'parentPath' in payload ? payload.parentPath : null
        return service.move(String(payload.path), typeof parent === 'string' ? parent : null)
      })
      ipc.handle(FolderChannels.delete, async (payload) => {
        if (typeof payload !== 'string') throw new AppError('INVALID_REQUEST')
        return service.delete(payload)
      })
    }
  }
}
