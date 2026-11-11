<script setup lang="ts">
// 行内公式 NodeView：点击切换为行内 input 编辑 LaTeX，输入实时写回节点属性；
// 渲染结果由 KaTeX 生成，语法错误时以虚线下划线标记。
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

// 阻止冒泡避免 ProseMirror 把点击当作节点选中；等 input 挂载后再聚焦
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
  background: var(--bg-inset);
  border: 1px solid var(--accent);
  border-radius: var(--radius-inline);
  font-family: var(--font-mono);
  font-size: var(--font-size-ui);
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
