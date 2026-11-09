<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    text: string
    delay?: number
  }>(),
  { delay: 400 }
)

const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

function show(): void {
  timer = setTimeout(() => {
    visible.value = true
  }, props.delay)
}

function hide(): void {
  if (timer) clearTimeout(timer)
  timer = null
  visible.value = false
}

onBeforeUnmount(hide)
onMounted(() => undefined)
</script>

<template>
  <span class="tooltip-host" @mouseenter="show" @mouseleave="hide" @focusin="show" @focusout="hide">
    <slot />
    <span v-if="visible" class="tooltip" role="tooltip">{{ props.text }}</span>
  </span>
</template>

<style scoped>
.tooltip-host {
  position: relative;
  display: inline-flex;
}

.tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 70;
  max-width: 240px;
  padding: 4px 8px;
  background: var(--tooltip-bg);
  color: var(--tooltip-text);
  border-radius: var(--radius-input);
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
}
</style>
