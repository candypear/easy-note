<script setup lang="ts">
// 顶栏：侧栏开关、面包屑、源码/主题/设置/右栏按钮；整条作为无边框窗口的
// 拖拽区（drag-region），按钮用 no-drag 排除；macOS 留出系统红绿灯位置。
import { computed, onMounted, ref } from 'vue'
import { useContext } from '../../../app/providers'
import BaseMenu, { type MenuItem } from '../../../ui/menu/BaseMenu.vue'
import Icon from '../../../ui/icons/Icon.vue'
import BaseTooltip from '../../../ui/tooltip/BaseTooltip.vue'
import TitleBarControls from './TitleBarControls.vue'
import type { ThemeMode } from '@shared/contracts/settings'

const ctx = useContext()
const { t } = ctx.i18n
const isMac = computed(() => ctx.shell.state.platform === 'darwin')

const themeOpen = ref(false)
const themePosition = ref({ x: 0, y: 0 })
const themeButton = ref<HTMLElement | null>(null)

const themeItems = computed<MenuItem[]>(() => [
  { id: 'light', label: t('shell.theme.light'), icon: 'sun', checked: ctx.shell.state.themeMode === 'light' },
  { id: 'dark', label: t('shell.theme.dark'), icon: 'moon', checked: ctx.shell.state.themeMode === 'dark' },
  { id: 'system', label: t('shell.theme.system'), icon: 'monitor', checked: ctx.shell.state.themeMode === 'system' }
])

const crumbs = computed(() => {
  // 面包屑 = 库名 + 笔记所在目录层级（不含文件名）；图谱视图追加"关系图谱"
  const parts: string[] = [ctx.shell.state.vaultName]
  const path = ctx.workspace.currentNotePath
  if (path) {
    const segments = path.split('/').slice(0, -1).filter(Boolean)
    parts.push(...segments)
  }
  if (ctx.workspace.view === 'graph') parts.push(t('shell.graph'))
  return parts
})

function openThemeMenu(): void {
  // 以按钮位置锚定菜单：右缘对齐按钮右侧（菜单宽约 180px），下方留 4px 间距
  const rect = themeButton.value?.getBoundingClientRect()
  if (!rect) return
  themePosition.value = { x: rect.right - 180, y: rect.bottom + 4 }
  themeOpen.value = true
}

function chooseTheme(id: string): void {
  themeOpen.value = false
  const mode = id as ThemeMode
  // 先改本地状态让主题立即生效，再异步写入设置持久化，不阻塞交互
  ctx.shell.setThemeMode(mode)
  void ctx.api.settings.set({ theme: mode })
}

function toggleMaximize(): void {
  void ctx.api.window.toggleMaximize()
}

onMounted(() => undefined)
</script>

<template>
  <header class="topbar drag-region" :class="{ mac: isMac }">
    <BaseTooltip :text="t('shell.toggleSidebar')">
      <button class="icon-button no-drag" type="button" :aria-label="t('shell.toggleSidebar')" @click="ctx.shell.toggleSidebar()">
        <Icon name="sidebar" />
      </button>
    </BaseTooltip>

    <nav class="breadcrumb no-drag" aria-label="路径">
      <template v-for="(crumb, index) in crumbs" :key="index">
        <span v-if="index > 0" class="sep">/</span>
        <span class="crumb">{{ crumb }}</span>
      </template>
    </nav>

    <span class="spacer" @dblclick="toggleMaximize" />

    <BaseTooltip v-if="ctx.workspace.currentNoteId && ctx.workspace.view === 'note'" :text="t('shell.sourceMode')">
      <button
        class="icon-button no-drag"
        :class="{ active: ctx.workspace.sourceMode }"
        type="button"
        :aria-label="t('shell.sourceMode')"
        @click="ctx.workspace.toggleSourceMode()"
      >
        <Icon name="source" />
      </button>
    </BaseTooltip>

    <BaseTooltip :text="t('shell.theme')">
      <button ref="themeButton" class="icon-button no-drag" type="button" :aria-label="t('shell.theme')" @click="openThemeMenu">
        <Icon :name="ctx.shell.state.resolvedTheme === 'dark' ? 'moon' : 'sun'" />
      </button>
    </BaseTooltip>

    <BaseTooltip :text="t('shell.settings')">
      <button class="icon-button no-drag" type="button" :aria-label="t('shell.settings')" @click="ctx.shell.openOverlay('settings')">
        <Icon name="settings" />
      </button>
    </BaseTooltip>

    <BaseTooltip :text="t('shell.toggleRight')">
      <button class="icon-button no-drag" type="button" :aria-label="t('shell.toggleRight')" @click="ctx.shell.toggleRight()">
        <Icon name="panelRight" />
      </button>
    </BaseTooltip>

    <TitleBarControls v-if="!isMac" />

    <BaseMenu
      :open="themeOpen"
      :x="themePosition.x"
      :y="themePosition.y"
      :items="themeItems"
      @select="chooseTheme"
      @close="themeOpen = false"
    />
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 4px;
  height: var(--topbar-height);
  padding: 0 0 0 8px;
  background: var(--bg-app);
  border-bottom: 1px solid var(--border);
  flex: none;
  position: relative;
}

.topbar.mac {
  padding-left: 78px;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-input);
  color: var(--text-secondary);
}

.icon-button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.icon-button.active {
  background: var(--bg-selected);
  color: var(--accent);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-left: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  -webkit-app-region: drag;
}

.crumb {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crumb:last-child {
  color: var(--text-primary);
}

.sep {
  color: var(--text-tertiary);
}

.spacer {
  flex: 1;
  height: 100%;
  -webkit-app-region: drag;
}
</style>
