<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'text'
    size?: 'sm' | 'md'
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'ghost', size: 'md', disabled: false, type: 'button' }
)

const className = computed(() => ['base-button', `is-${props.variant}`, `is-${props.size}`])
</script>

<template>
  <button
    :type="props.type"
    :class="className"
    :disabled="props.disabled"
    class="no-drag"
  >
    <slot />
  </button>
</template>

<style scoped>
.base-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: var(--radius-input);
  white-space: nowrap;
  transition: background-color var(--duration-hover) ease-out, color var(--duration-hover) ease-out;
  user-select: none;
}

.is-md {
  height: 32px;
  padding: 0 12px;
  font-size: var(--font-size-ui);
}

.is-sm {
  height: 28px;
  padding: 0 10px;
  font-size: var(--font-size-ui);
}

.is-primary {
  background: var(--accent);
  color: #fff;
  font-weight: 500;
}

.is-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.is-primary:active:not(:disabled) {
  background: var(--accent-active);
}

.is-secondary {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
}

.is-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
}

.is-ghost {
  background: transparent;
  color: var(--text-primary);
}

.is-ghost:hover:not(:disabled) {
  background: var(--bg-hover);
}

.is-danger {
  background: var(--danger);
  color: #fff;
  font-weight: 500;
}

.is-danger:hover:not(:disabled) {
  background: var(--danger-hover);
}

.is-danger:active:not(:disabled) {
  background: var(--danger-active);
}

.is-text {
  background: transparent;
  color: var(--accent);
  padding: 0;
  height: auto;
  font-size: var(--font-size-ui);
}

.is-text:hover:not(:disabled) {
  text-decoration: underline;
}
</style>
