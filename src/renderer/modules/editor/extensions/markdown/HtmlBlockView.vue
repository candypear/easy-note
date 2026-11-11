<script setup lang="ts">
// HTML 块 NodeView：以纯文本（pre 插值）展示 HTML 源码，不渲染执行，避免注入风险。
import { NodeViewWrapper } from '@tiptap/vue-3'
import { computed, type PropType } from 'vue'

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
const value = computed(() => String(props.node.attrs.value ?? ''))
</script>

<template>
  <NodeViewWrapper as="pre" class="html-block">{{ value }}</NodeViewWrapper>
</template>

<style scoped>
.html-block {
  margin: 8px 0;
  padding: 8px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-menu);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-secondary);
  white-space: pre-wrap;
  overflow-x: auto;
}
</style>
