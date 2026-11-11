// 设置模块：读写应用设置 JSON（主题、字号、布局、最近笔记、vault 路径等），
// 持久化前做校验归一化，变更时广播事件，并桥接系统主题变化。
import type { MainContext } from '@main/bootstrap/types'
import type { MainModule } from '@main/bootstrap/types'
import type { SettingsDTO, SettingsPatch } from '@shared/contracts/settings'
import { SettingsChannels } from '@shared/contracts/settings'
import { AppError } from '@main/platform/errors'
import { asNoteId } from '@shared/types/brand'

const DEFAULTS: SettingsDTO = {
  theme: 'system',
  fontSize: 16,
  vaultPath: null,
  sidebarWidth: 260,
  rightWidth: 300,
  sidebarOpen: true,
  rightOpen: true,
  recentNoteIds: [],
  lastIndexedAt: null
}

export class SettingsService {
  private state: SettingsDTO = { ...DEFAULTS, recentNoteIds: [] }
  private loadPromise: Promise<void> | null = null

  constructor(private readonly ctx: MainContext) {}

  // 只加载一次，并发调用共享同一个 Promise
  load(): Promise<void> {
    this.loadPromise ??= this.readSettings()
    return this.loadPromise
  }

  // 读取时与默认值合并；文件缺失或损坏则整体回退默认设置，保证应用可启动
  private async readSettings(): Promise<void> {
    try {
      const raw = await this.ctx.fs.readFile(this.ctx.paths.settingsFile)
      const parsed = JSON.parse(raw) as Partial<SettingsDTO>
      this.state = { ...DEFAULTS, ...parsed, recentNoteIds: parsed.recentNoteIds ?? [] }
      this.normalize()
    } catch {
      this.state = { ...DEFAULTS, recentNoteIds: [] }
    }
  }

  get(): SettingsDTO {
    return { ...this.state, recentNoteIds: [...this.state.recentNoteIds] }
  }

  // 合并补丁 -> 归一化 -> 持久化；主题变更需同步到原生层，最后广播变更的键与全量设置
  async patch(patch: SettingsPatch): Promise<SettingsDTO> {
    await this.load()
    const keys = Object.keys(patch) as (keyof SettingsDTO)[]
    Object.assign(this.state, patch)
    this.normalize()
    await this.persist()
    if (keys.includes('theme')) this.ctx.theme.setMode(this.state.theme)
    this.ctx.events.publish('settings:changed', { keys, settings: this.get() })
    return this.get()
  }

  async addRecent(noteId: string): Promise<SettingsDTO> {
    await this.load()
    const id = asNoteId(noteId)
    const recent = [id, ...this.state.recentNoteIds.filter((item) => item !== id)].slice(0, 30)
    return this.patch({ recentNoteIds: recent } as SettingsPatch)
  }

  async setLastIndexedAt(iso: string): Promise<void> {
    await this.load()
    this.state.lastIndexedAt = iso
    await this.persist()
  }

  async setVaultPath(path: string | null): Promise<void> {
    await this.patch({ vaultPath: path })
  }

  // 白名单/夹逼校验：防止磁盘上的脏数据或非法补丁破坏界面
  private normalize(): void {
    if (!['light', 'dark', 'system'].includes(this.state.theme)) this.state.theme = 'system'
    if (![14, 16, 18].includes(this.state.fontSize)) this.state.fontSize = 16
    this.state.sidebarWidth = Math.min(400, Math.max(200, Number(this.state.sidebarWidth) || 260))
    this.state.rightWidth = Math.min(480, Math.max(240, Number(this.state.rightWidth) || 300))
    this.state.sidebarOpen = Boolean(this.state.sidebarOpen)
    this.state.rightOpen = Boolean(this.state.rightOpen)
    this.state.recentNoteIds = this.state.recentNoteIds.filter((id) => typeof id === 'string')
    this.state.lastIndexedAt =
      typeof this.state.lastIndexedAt === 'string' ? this.state.lastIndexedAt : null
    this.state.vaultPath = typeof this.state.vaultPath === 'string' ? this.state.vaultPath : null
  }

  private async persist(): Promise<void> {
    try {
      await this.ctx.fs.writeFileAtomic(this.ctx.paths.settingsFile, JSON.stringify(this.state, null, 2))
    } catch (error) {
      throw new AppError('FILE_WRITE_FAILED', `设置保存失败：${String(error)}`)
    }
  }
}

export interface SettingsModule extends MainModule {
  service: SettingsService
}

export function createSettingsModule(ctx: MainContext): SettingsModule {
  const service = new SettingsService(ctx)
  let unsubscribe: (() => void) | null = null
  return {
    id: 'settings',
    migrations: [],
    service,
    registerIpc(ipc) {
      ipc.handle(SettingsChannels.get, () => service.get())
      ipc.handle(SettingsChannels.set, async (payload) => {
        if (!payload || typeof payload !== 'object') throw new AppError('INVALID_REQUEST')
        return service.patch(payload as SettingsPatch)
      })
      ipc.handle(SettingsChannels.addRecent, (payload) => {
        if (!payload || typeof payload !== 'object' || !('noteId' in payload)) {
          throw new AppError('INVALID_REQUEST')
        }
        return service.addRecent(String(payload.noteId))
      })
      ipc.handle(SettingsChannels.rebuildIndex, () => ctx.services.indexer.rebuild())
    },
    async start() {
      // 启动时应用已保存主题，并把系统主题变化转发为事件供渲染进程跟随
      await service.load()
      ctx.theme.setMode(service.get().theme)
      unsubscribe = ctx.theme.onChange((theme) => ctx.events.publish('theme:changed', { theme }))
    },
    async stop() {
      unsubscribe?.()
    }
  }
}
