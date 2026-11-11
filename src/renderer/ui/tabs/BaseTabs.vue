<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  tabs: { id: string; label: string; icon?: string }[]
}>()

const emit = defineEmits<{ 'update:modelValue': [id: string] }>()
</script>

<template>
  <div class="base-tabs" role="tablist">
    <button
      v-for="tab in props.tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: tab.id === props.modelValue }"
      type="button"
      role="tab"
      :aria-selected="tab.id === props.modelValue"
      @click="emit('update:modelValue', tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.base-tabs {
  display: flex;
  align-items: stretch;
  height: 32px;
  gap: 4px;
}

.tab {
  position: relative;
  height: 32px;
  padding: 0 8px;
  font-size: var(--font-size-ui);
  color: var(--text-secondary);
}

.tab:hover {
  color: var(--text-primary);
}

.tab.active {
  color: var(--text-primary);
}

.tab.active::after {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 0;
  height: 2px;
  background: var(--accent);
  border-radius: 1px;
}
</style>
