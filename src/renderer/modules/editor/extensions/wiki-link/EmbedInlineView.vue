<script setup lang="ts">
// 行内嵌入 NodeView（段落内混排的 ![[...]]）：显示轻量链接胶囊，
// 点击时实时解析目标块并跳转到源笔记定位。
import { computed, type PropType } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { useContext } from '../../../../app/providers'
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
const ctx = useContext()
const note = computed(() => String(props.node.attrs.note ?? ''))
const blockId = computed(() => String(props.node.attrs.blockId ?? ''))

async function open(event: MouseEvent): Promise<void> {
  event.stopPropagation()
  const result = await ctx.api.block.resolve(note.value, blockId.value)
  if (result.ok && result.data) {
    ctx.workspace.openNote(result.data.noteId, { blockId: result.data.blockId })
  }
}
</script>

<template>
  <NodeViewWrapper
    as="span"
    class="embed-inline"
    :title="`![[${note}#^${blockId}]]`"
    @click="open"
  >
    <Icon name="link" :size="12" />
    <span>{{ note }}</span>
  </NodeViewWrapper>
</template>

<style scoped>
.embed-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 5px;
  background: var(--bg-inset);
  border-radius: var(--radius-inline);
  color: var(--text-secondary);
  font-size: 0.92em;
  cursor: pointer;
}

.embed-inline:hover {
  color: var(--accent);
}
</style>
