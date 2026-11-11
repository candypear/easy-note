<script setup lang="ts">
// 侧栏宿主：渲染各模块注册的侧栏视图（文件/标签/搜索）为顶部标签，
// 按 shell 状态切换当前视图组件；底部固定"关系图谱"入口。
import { useContext } from '../../../app/providers'
import Icon from '../../../ui/icons/Icon.vue'

const ctx = useContext()
const { t } = ctx.i18n
// 注册发生在模块 install（挂载前），此处一次性读取即可，无需响应式
const views = ctx.shell.registry.sidebar.views()

function select(id: string): void {
  ctx.shell.setSidebarView(id)
}

function openGraph(): void {
  // 同时切工作区服务视图与外壳视图 id，保证状态栏/顶栏与渲染组件一致
  ctx.workspace.openGraph()
  ctx.shell.setWorkspaceView('graph')
}
</script>

<template>
  <div class="sidebar">
    <div class="tabs" role="tablist">
      <button
        v-for="view in views"
        :key="view.id"
        class="tab"
        :class="{ active: ctx.shell.state.sidebarView === view.id }"
        type="button"
        role="tab"
        :aria-selected="ctx.shell.state.sidebarView === view.id"
        @click="select(view.id)"
      >
        <Icon :name="view.icon" :size="16" />
        <span>{{ t(view.titleKey) }}</span>
      </button>
    </div>
    <div class="view">
      <component
        :is="views.find((view) => view.id === ctx.shell.state.sidebarView)?.component"
        v-if="views.some((view) => view.id === ctx.shell.state.sidebarView)"
      />
    </div>
    <div class="footer">
      <button class="graph-button" type="button" @click="openGraph">
        <Icon name="graph" :size="16" />
        <span>{{ t('explorer.graph') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--bg-left-panel);
  border-right: 1px solid var(--border-layout);
}

.tabs {
  display: flex;
  height: 32px;
  padding: 0 4px;
  gap: 2px;
  flex: none;
}

.tab {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 32px;
  border-radius: var(--radius-input);
  font-size: 13px;
  color: var(--text-secondary);
}

.tab:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tab.active {
  background: var(--bg-selected);
  color: var(--text-primary);
}

.view {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.footer {
  flex: none;
  padding: 4px;
  border-top: 1px solid var(--border);
}

.graph-button {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border-radius: var(--radius-input);
  font-size: 13px;
  color: var(--text-secondary);
}

.graph-button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
