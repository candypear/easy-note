<script setup lang="ts">
// 块引用 NodeView（[[笔记#^块]]）：显示"笔记 · 块"标签，
// 点击解析块位置后打开目标笔记并触发块定位高亮。
import { NodeViewWrapper } from '@tiptap/vue-3'
import { computed, type PropType } from 'vue'
import { useContext } from '../../../../app/providers'

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
const label = computed(() => `${note.value} · 块`)

// openNote 附带 blockId，由 NoteEditor 的 reveal 流程滚动定位并闪烁目标块
async function open(event: MouseEvent): Promise<void> {
  event.stopPropagation()
  event.preventDefault()
  const result = await ctx.api.block.resolve(note.value, blockId.value)
  if (result.ok && result.data) {
    ctx.workspace.openNote(result.data.noteId, {
      blockId: result.data.blockId
    })
  }
}
</script>

<template>
  <NodeViewWrapper as="span" class="block-ref" :title="`${note} #^${blockId}`" @click="open">{{ label }}</NodeViewWrapper>
</template>

<style scoped>
.block-ref {
  color: var(--accent);
  cursor: pointer;
  background: var(--bg-selected);
  border-radius: var(--radius-inline);
  padding: 0 4px;
  font-size: 0.95em;
}

.block-ref:hover {
  text-decoration: underline;
}
</style>
