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
  const api = window.easynote
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

  for (const rendererModule of rendererModules as RendererModule[]) {
    try {
      rendererModule.install(app, ctx)
    } catch (error) {
      console.error(`renderer module failed: ${rendererModule.id}`, error)
    }
  }

  app.config.errorHandler = (error) => {
    console.error('renderer error', error)
  }

  await Promise.resolve()
  app.mount('#app')
}

void boot()
