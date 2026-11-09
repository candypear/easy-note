<script setup lang="ts">
import { computed } from 'vue'
import { ICON_PATHS } from './paths'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number
    strokeWidth?: number
  }>(),
  { size: 16, strokeWidth: 1.5 }
)

const paths = computed(() => ICON_PATHS[props.name] ?? [])
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <path
      v-for="(path, index) in paths"
      :key="index"
      :d="path.d"
      :fill="path.fill ? 'currentColor' : 'none'"
      :stroke="path.fill ? 'none' : 'currentColor'"
      :stroke-width="props.strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
