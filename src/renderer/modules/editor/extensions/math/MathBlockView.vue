<script setup lang="ts">
import { NodeViewWrapper } from '@tiptap/vue-3'
import { computed, nextTick, onMounted, ref, type PropType } from 'vue'
import { renderKatex } from './katex'

interface NodeViewLike {
  node: { attrs: Record<string, unknown> }
  updateAttributes: (attrs: Record<string, unknown>) => void
  selected: boolean
}

const props = defineProps({
  node: { type: Object as PropType<NodeViewLike['node']>, required: true },
  updateAttributes: {
    type: Function as PropType<NodeViewLike['updateAttributes']>,
    required: true
  },
  selected: { type: Boolean, default: false }
})
const editing = ref(false)
const input = ref<HTMLTextAreaElement | null>(null)

const latex = computed(() => String(props.node.attrs.latex ?? ''))
const result = computed(() => renderKatex(latex.value, true))

async function startEdit(): Promise<void> {
  editing.value = true
  await nextTick()
  input.value?.focus()
}

function update(value: string): void {
  props.updateAttributes({ latex: value })
}

function stopEdit(): void {
  editing.value = false
}

onMounted(() => undefined)
</script>

<template>
  <NodeViewWrapper as="div" class="math-block" :class="{ editing }" @click="startEdit">
    <textarea
      v-if="editing"
      ref="input"
      class="math-input"
      :value="latex"
      rows="1"
      spellcheck="false"
      @input="update(($event.target as HTMLTextAreaElement).value)"
      @blur="stopEdit"
      @keydown.stop
      @click.stop
    />
    <div class="math-render" v-html="result.html" />
    <p v-if="result.error" class="math-error">公式语法错误</p>
  </NodeViewWrapper>
</template>

<style scoped>
.math-block {
  padding: 8px 0;
  cursor: text;
}

.math-input {
  width: 100%;
  min-height: 32px;
  margin-bottom: 8px;
  padding: 6px 8px;
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
  border-radius: var(--radius-input);
  font-family: var(--font-mono);
  font-size: 13.5px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
}

.math-render {
  display: flex;
  justify-content: center;
  overflow-x: auto;
}

.math-error {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--danger);
}
</style>
