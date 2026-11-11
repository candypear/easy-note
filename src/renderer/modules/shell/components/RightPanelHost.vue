<script setup lang="ts">
// 右栏宿主：把注册的右栏标签（反向链接/大纲等）渲染为 BaseTabs，
// 受控于 shell.rightTab 状态；找不到当前 id 时回退到第一个标签。
import { computed } from 'vue'
import { useContext } from '../../../app/providers'
import Icon from '../../../ui/icons/Icon.vue'
import BaseTabs from '../../../ui/tabs/BaseTabs.vue'

const ctx = useContext()
const { t } = ctx.i18n
const tabs = ctx.shell.registry.rightPanel.tabs()
const tabItems = computed(() => tabs.map((tab) => ({ id: tab.id, label: t(tab.titleKey) })))
const active = computed(() => tabs.find((tab) => tab.id === ctx.shell.state.rightTab) ?? tabs[0])
</script>

<template>
  <div class="right-panel">
    <header class="panel-header">
      <BaseTabs
        :model-value="ctx.shell.state.rightTab"
        :tabs="tabItems"
        @update:model-value="ctx.shell.setRightTab($event)"
      />
      <button class="icon-button" type="button" aria-label="收起" @click="ctx.shell.toggleRight()">
        <Icon name="chevronRight" :size="16" />
      </button>
    </header>
    <div class="panel-body">
      <component :is="active?.component" v-if="active" />
    </div>
  </div>
</template>

<style scoped>
.right-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--bg-right-panel);
  border-left: 1px solid var(--border-layout);
}

.panel-header {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 4px 0 8px;
  flex: none;
}

.panel-header > :first-child {
  flex: 1;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-input);
  color: var(--text-tertiary);
}

.icon-button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}
</style>
