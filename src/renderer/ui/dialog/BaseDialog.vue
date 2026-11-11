<script setup lang="ts">
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
    event.stopPropagation()
    emit('close')
  }
}

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
