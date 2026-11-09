<script setup lang="ts">
import { NodeViewWrapper } from '@tiptap/vue-3'
import { computed, nextTick, ref, type PropType } from 'vue'
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
const input = ref<HTMLInputElement | null>(null)

const latex = computed(() => String(props.node.attrs.latex ?? ''))
const result = computed(() => renderKatex(latex.value, false))

async function startEdit(event: MouseEvent): Promise<void> {
  event.stopPropagation()
  editing.value = true
  await nextTick()
  input.value?.focus()
}

function update(value: string): void {
  props.updateAttributes({ latex: value })
}
</script>

<template>
  <NodeViewWrapper as="span" class="math-inline" :class="{ invalid: result.error }">
    <input
      v-if="editing"
      ref="input"
      class="math-inline-input"
      :value="latex"
      spellcheck="false"
      @input="update(($event.target as HTMLInputElement).value)"
      @blur="editing = false"
      @keydown.stop
    />
    <span v-else class="math-inline-render" @click="startEdit" v-html="result.html" />
  </NodeViewWrapper>
</template>

<style scoped>
.math-inline {
  display: inline-flex;
  max-width: 100%;
  vertical-align: baseline;
}

.math-inline-input {
  min-width: 120px;
  padding: 0 4px;
  background: var(--bg-sidebar);
  border: 1px solid var(--accent);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 13.5px;
  outline: none;
}

.math-inline-render {
  cursor: text;
  padding: 0 1px;
}

.math-inline.invalid .math-inline-render {
  border-bottom: 1px dashed var(--danger);
}
</style>
