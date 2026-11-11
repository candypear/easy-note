// 搜索模块入口：注册侧栏搜索视图与 Ctrl+Shift+F 全局快捷键，
// 并负责"切到搜索面板并聚焦输入框"的跨组件协调。
import type { RendererModule } from '../../app/context'
import SearchView from './components/SearchView.vue'

// 聚焦入口，install 时赋值；快捷键回调通过它触发聚焦
let focus: (() => void) | null = null

export const searchModule: RendererModule = {
  id: 'search',
  install(_app, ctx) {
    ctx.shell.registry.sidebar.registerView({
      id: 'search',
      titleKey: 'sidebar.search',
      icon: 'search',
      order: 30,
      component: SearchView
    })
    ctx.shortcuts.register('Ctrl+Shift+F', (event) => {
      event.preventDefault()
      ctx.shell.setSidebarView('search')
      focus?.()
    })
    focus = () => {
      ctx.shell.setSidebarView('search')
      // 面板可能刚被切换挂载，等一帧再广播自定义事件；
      // SearchView 监听该事件聚焦输入框，避免模块直接持有组件实例
      requestAnimationFrame(() => window.dispatchEvent(new Event('easynote:focus-search')))
    }
  }
}
