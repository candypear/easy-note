// 窗口模块：封装主窗口的最小化/最大化/关闭控制与平台信息查询，
// 并广播最大化状态变化（自绘标题栏按钮需要跟随）。
import type { BrowserWindow } from 'electron'
import type { MainContext, MainModule } from '@main/bootstrap/types'
import { WindowChannels } from '@shared/contracts/window'
import { AppError } from '@main/platform/errors'

export class WindowService {
  private window: BrowserWindow | null = null

  constructor(private readonly ctx: MainContext) {}

  // 绑定主窗口并监听 maximize/unmaximize，把状态广播给渲染进程更新标题栏按钮
  attach(window: BrowserWindow): void {
    this.window = window
    const publish = (): void => {
      this.ctx.events.publish('window:maximized-changed', window.isMaximized())
    }
    window.on('maximize', publish)
    window.on('unmaximize', publish)
  }

  private requireWindow(): BrowserWindow {
    const window = this.window ?? this.ctx.getMainWindow()
    if (!window) throw new AppError('INTERNAL', '主窗口尚未创建')
    return window
  }

  minimize(): void {
    this.requireWindow().minimize()
  }

  toggleMaximize(): boolean {
    const window = this.requireWindow()
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return window.isMaximized()
  }

  close(): void {
    this.requireWindow().close()
  }

  isMaximized(): boolean {
    return this.requireWindow().isMaximized()
  }

  platform(): string {
    return process.platform
  }
}

export interface WindowModule extends MainModule {
  service: WindowService
}

export function createWindowModule(ctx: MainContext): WindowModule {
  const service = new WindowService(ctx)
  return {
    id: 'window',
    migrations: [],
    service,
    registerIpc(ipc) {
      ipc.handle(WindowChannels.minimize, () => service.minimize())
      ipc.handle(WindowChannels.toggleMaximize, () => service.toggleMaximize())
      ipc.handle(WindowChannels.close, () => service.close())
      ipc.handle(WindowChannels.isMaximized, () => service.isMaximized())
      ipc.handle(WindowChannels.platform, () => service.platform())
    }
  }
}
