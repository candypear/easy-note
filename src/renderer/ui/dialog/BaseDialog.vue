<script setup lang="ts">
// 通用对话框：受控组件（open 由父级持有，关闭只发 close 事件）；
// Teleport 到 body 避免被父级 overflow/z-index 裁剪，打开时抢占 Esc 并聚焦首个可交互元素。
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    width?: number
  }>(),
  { width: 400 }
)

const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    // 捕获阶段拦截并阻止冒泡，避免 Esc 同时触发全局快捷键或其他浮层
    event.stopPropagation()
    emit('close')
  }
}

// 打开时才挂全局监听、关闭即移除，避免常驻监听干扰其他组件；
// nextTick 后面板已渲染，聚焦首个可交互元素以支持纯键盘操作
watch(
  () => props.open,
  async (open) => {
    if (!open) {
      document.removeEventListener('keydown', onKeydown, true)
      return
    }
    document.addEventListener('keydown', onKeydown, true)
    await nextTick()
    const target = panel.value?.querySelector<HTMLElement>(
      'input, textarea, select, button:not([disabled]), [tabindex="0"]'
    )
    target?.focus()
  },
  { immediate: true }
)

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="dialog-backdrop" @pointerdown.self="emit('close')">
      <div
        ref="panel"
        class="dialog-panel no-drag"
        role="dialog"
        aria-modal="true"
        :style="{ width: `${props.width}px` }"
      >
        <h2 v-if="props.title" class="dialog-title">{{ props.title }}</h2>
        <div class="dialog-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="dialog-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--backdrop);
}

.dialog-panel {
  max-width: calc(100vw - 32px);
  max-height: min(640px, calc(100vh - 64px));
  display: flex;
  flex-direction: column;
  padding: 20px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-dialog);
  box-shadow: var(--shadow-dialog);
}

.dialog-title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
}

.dialog-body {
  min-height: 0;
  overflow: auto;
  font-size: var(--font-size-ui);
  line-height: 1.6;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
</style>
