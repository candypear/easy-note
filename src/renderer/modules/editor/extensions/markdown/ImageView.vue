<script setup lang="ts">
import { NodeViewWrapper } from '@tiptap/vue-3'
import { computed, type PropType } from 'vue'
import Icon from '../../../../ui/icons/Icon.vue'

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
const alt = computed(() => String(props.node.attrs.alt ?? ''))
const src = computed(() => String(props.node.attrs.src ?? ''))
</script>

<template>
  <NodeViewWrapper as="span" class="image-placeholder" :title="src">
    <Icon name="file" :size="14" />
    <span>图片附件暂不支持：{{ alt || src }}</span>
  </NodeViewWrapper>
</template>

<style scoped>
.image-placeholder {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 1px 6px;
  background: var(--bg-inset);
  border-radius: var(--radius-inline);
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
