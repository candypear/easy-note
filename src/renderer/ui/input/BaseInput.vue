<script setup lang="ts">
// 通用输入框：严格受控（值只来自 modelValue，输入经 update:modelValue 回写），
// 额外发 enter/escape 语义事件；暴露 focus() 供父组件主动聚焦。
import { ref } from 'vue'
import Icon from '../icons/Icon.vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    icon?: string
    clearable?: boolean
    autofocus?: boolean
    size?: 'sm' | 'md'
  }>(),
  { placeholder: '', clearable: false, autofocus: false, size: 'md' }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  enter: [value: string]
  escape: []
}>()

const input = ref<HTMLInputElement | null>(null)

defineExpose({ focus: () => input.value?.focus() })

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') emit('enter', props.modelValue)
  if (event.key === 'Escape') emit('escape')
}
</script>

<template>
  <div class="base-input" :class="`is-${props.size}`">
    <Icon v-if="props.icon" :name="props.icon" :size="16" class="leading" />
    <input
      ref="input"
      :value="props.modelValue"
      :placeholder="props.placeholder"
      :autofocus="props.autofocus"
      spellcheck="false"
      @input="onInput"
      @keydown="onKeydown"
    />
    <button
      v-if="props.clearable && props.modelValue"
      class="clear"
      type="button"
      aria-label="清除"
      @click="emit('update:modelValue', '')"
    >
      <Icon name="x" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.base-input {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 8px;
  background: var(--bg-app);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-input);
}

.base-input.is-sm {
  height: 28px;
}

.base-input:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--focus-ring);
}

.leading {
  color: var(--text-tertiary);
  flex: none;
}

input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  outline: none;
  font-size: var(--font-size-ui);
}

input::placeholder {
  color: var(--text-tertiary);
}

.clear {
  display: inline-flex;
  color: var(--text-tertiary);
  padding: 2px;
  border-radius: var(--radius-inline);
}

.clear:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
