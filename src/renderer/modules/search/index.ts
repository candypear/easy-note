import type { RendererModule } from '../../app/context'
import SearchView from './components/SearchView.vue'

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
      requestAnimationFrame(() => window.dispatchEvent(new Event('easynote:focus-search')))
    }
  }
}
