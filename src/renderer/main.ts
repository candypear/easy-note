// 渲染进程入口：组装全局上下文（API 桥、i18n、快捷键、shell、workspace），
// 按序安装各渲染模块后挂载根组件，是渲染侧唯一的组合根。
import { createApp } from 'vue'
import App from './App.vue'
import { createI18n } from './i18n'
import { zhCN } from './i18n/zh-CN'
import { createShortcuts } from './app/shortcuts'
import { createWorkspace } from './app/workspace'
import { createShellService } from './modules/shell/stores/shell-store'
import { RENDERER_CONTEXT } from './app/providers'
import type { RendererContext, RendererModule } from './app/context'
import { rendererModules } from './app/modules'

async function boot(): Promise<void> {
  // window.easynote 由 preload 通过 contextBridge 注入，是访问主进程的唯一通道
  const api = window.easynote
  // 上下文集中持有跨模块单例，经 provide/inject 分发，避免各模块各自建状态
  const ctx: RendererContext = {
    api,
    events: api.events,
    i18n: createI18n({ ...zhCN }),
    shortcuts: createShortcuts(),
    shell: createShellService(),
    workspace: createWorkspace()
  }

  const app = createApp(App)
  app.provide(RENDERER_CONTEXT, ctx)

  // 按注册顺序安装模块（shell 必须先装，供后续模块注册视图）；
  // 单个模块安装失败只记日志，不阻断其余模块与应用启动
  for (const rendererModule of rendererModules as RendererModule[]) {
    try {
      rendererModule.install(app, ctx)
    } catch (error) {
      console.error(`renderer module failed: ${rendererModule.id}`, error)
    }
  }

  // 兜底捕获组件树内未处理异常，避免整棵应用崩溃且无迹可查
  app.config.errorHandler = (error) => {
    console.error('renderer error', error)
  }

  // 让出一个微任务再挂载，确保 install 阶段触发的状态初始化先生效
  await Promise.resolve()
  app.mount('#app')
}

void boot()
