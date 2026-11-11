<script setup lang="ts">
// Markdown 源码模式：用 CodeMirror 适配层编辑整篇笔记原文，
// 通过 v-model 与外部（NoteEditor）双向同步文本。
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

// 外部值变化时回写 CodeMirror；适配层的 setValue 会跳过与当前内容相同的值，避免回环触发 onChange
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
