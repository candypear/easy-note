<script setup lang="ts">
import { useToast } from './toast'

const { items, dismiss } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" role="status" aria-live="polite">
      <button
        v-for="item in items"
        :key="item.id"
        class="toast"
        :class="item.type"
        type="button"
        @click="dismiss(item.id)"
      >
        {{ item.message }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  bottom: calc(var(--statusbar-height) + 24px);
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  z-index: 60;
  pointer-events: none;
}

.toast {
  max-width: 360px;
  padding: 8px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-menu);
  box-shadow: var(--shadow-menu);
  font-size: var(--font-size-meta);
  color: var(--text-primary);
  pointer-events: auto;
}

.toast.error {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
}
</style>
