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
      state.sidebarWidth = Math.max(200, Math.min(400, Math.round(width)))
    },
    setRightWidth(width) {
      state.rightWidth = Math.max(240, Math.min(480, Math.round(width)))
    },
    setSidebarView(id) {
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
