<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createCodeEditor, type CodeEditorHandle } from '../extensions/code-block/codemirror-adapter'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const host = ref<HTMLElement | null>(null)
let editor: CodeEditorHandle | null = null

onMounted(() => {
  if (!host.value) return
  editor = createCodeEditor(host.value, {
    value: props.modelValue,
    language: 'markdown',
    lineNumbers: true,
    onChange(value) {
      emit('update:modelValue', value)
    }
  })
})

watch(
  () => props.modelValue,
  (value) => editor?.setValue(value)
)

onBeforeUnmount(() => {
  editor?.destroy()
  editor = null
})
</script>

<template>
  <div ref="host" class="source-mode" />
</template>

<style scoped>
.source-mode {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 16px 0;
}

.source-mode :deep(.cm-editor) {
  height: 100%;
}

.source-mode :deep(.cm-scroller) {
  padding: 0 24px;
}
</style>
