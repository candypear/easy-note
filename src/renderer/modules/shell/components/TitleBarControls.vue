<script setup lang="ts">
// 自绘窗口控制按钮（最小化/最大化-还原/关闭），仅在非 macOS 平台渲染；
// 状态与动作全部来自 useWindowControls，经 IPC 委托主进程窗口模块。
import { useContext } from '../../../app/providers'
import Icon from '../../../ui/icons/Icon.vue'
import { useWindowControls } from '../composables/useWindowControls'

const ctx = useContext()
const { t } = ctx.i18n
const { isMaximized, minimize, toggleMaximize, close } = useWindowControls(ctx)
</script>

<template>
  <div class="window-controls no-drag">
    <button
      class="control"
      type="button"
      :aria-label="t('shell.minimize')"
      @click="minimize()"
    >
      <Icon name="minimize" :size="12" />
    </button>
    <button
      class="control"
      type="button"
      :aria-label="isMaximized ? t('shell.restore') : t('shell.maximize')"
      @click="toggleMaximize()"
    >
      <Icon :name="isMaximized ? 'restore' : 'maximize'" :size="12" />
    </button>
    <button
      class="control close"
      type="button"
      :aria-label="t('shell.close')"
      @click="close()"
    >
      <Icon name="close" :size="10" />
    </button>
  </div>
</template>

<style scoped>
.window-controls {
  display: flex;
  align-items: stretch;
  height: 100%;
  margin-left: 8px;
}

.control {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: var(--topbar-height);
  color: var(--text-secondary);
}

.control:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.control:active {
  background: var(--bg-selected);
}

.control.close:hover {
  background: var(--danger);
  color: #fff;
}

.control.close:active {
  background: var(--danger-active);
}
</style>
