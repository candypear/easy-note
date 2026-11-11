// 外壳服务实现：reactive 布局/主题状态 + 各插槽的组件注册表。
// 模块 install 时注册视图，外壳组件读取排序后的列表渲染，实现插件式装配。
import { reactive } from 'vue'
import type { Component } from 'vue'
import type {
  RightPanelTab,
  ShellRegistry,
  ShellService,
  ShellState,
  SidebarView,
  StatusItem,
  WorkspaceView
} from '../../../app/context'

export function createShellService(): ShellService {
  // 默认值仅兜底：启动后由 shell 模块用持久化设置覆盖
  const state = reactive<ShellState>({
    sidebarWidth: 260,
    rightWidth: 300,
    sidebarOpen: true,
    rightOpen: true,
    sidebarView: 'explorer',
    workspaceView: 'editor',
    rightTab: 'backlinks',
    themeMode: 'system',
    resolvedTheme: 'light',
    overlay: null,
    vaultName: 'EasyNote',
    vaultPath: null,
    platform: 'win32',
    fontSize: 16,
    indexProgress: null,
    vaultOpen: false,
    booted: false
  })

  const sidebar: SidebarView[] = []
  const workspace: WorkspaceView[] = []
  const tabs: RightPanelTab[] = []
  const status: StatusItem[] = []
  const overlays = new Map<string, Component>()

  // 注册表用普通数组/Map 即可（注册只发生在启动期）；
  // 读取时拷贝并按 order 排序，保证展示顺序稳定且不暴露内部引用
  const registry: ShellRegistry = {
    sidebar: {
      registerView(view) {
        sidebar.push(view)
      },
      views() {
        return [...sidebar].sort((a, b) => a.order - b.order)
      }
    },
    workspace: {
      registerView(view) {
        workspace.push(view)
      },
      views() {
        return [...workspace].sort((a, b) => a.order - b.order)
      }
    },
    rightPanel: {
      registerTab(tab) {
        tabs.push(tab)
      },
      tabs() {
        return [...tabs].sort((a, b) => a.order - b.order)
      }
    },
    status: {
      registerItem(item) {
        status.push(item)
      },
      items() {
        return [...status].sort((a, b) => a.order - b.order)
      }
    },
    overlay: {
      register(id, component) {
        overlays.set(id, component)
      },
      get(id) {
        return overlays.get(id)
      }
    }
  }

  return {
    state,
    registry,
    toggleSidebar() {
      state.sidebarOpen = !state.sidebarOpen
    },
    toggleRight() {
      state.rightOpen = !state.rightOpen
    },
    setSidebarWidth(width) {
      // 拖拽宽度在此统一夹取上下限并取整，调用方无需关心边界
      state.sidebarWidth = Math.max(200, Math.min(400, Math.round(width)))
    },
    setRightWidth(width) {
      state.rightWidth = Math.max(240, Math.min(480, Math.round(width)))
    },
    setSidebarView(id) {
      // 切换视图时顺带展开面板，避免"点了标签却看不到内容"
      state.sidebarView = id
      state.sidebarOpen = true
    },
    setWorkspaceView(id) {
      state.workspaceView = id
    },
    setRightTab(id) {
      state.rightTab = id
      state.rightOpen = true
    },
    openOverlay(id) {
      state.overlay = id
    },
    closeOverlay() {
      state.overlay = null
    },
    setThemeMode(mode) {
      state.themeMode = mode
    }
  }
}
