<script setup lang="ts">
// 块级嵌入 NodeView（![[笔记#^块]]）：挂载时经主进程解析目标块并展示其纯文本快照，
// 解析失败显示"引用已失效"，点击跳转到源笔记对应块。
import { NodeViewWrapper } from '@tiptap/vue-3'
import { computed, onMounted, ref, type PropType } from 'vue'
import type { BlockRefDTO } from '@shared/contracts/block'
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
const data = ref<BlockRefDTO | null>(null)
const failed = ref(false)

const note = computed(() => String(props.node.attrs.note ?? ''))
const blockId = computed(() => String(props.node.attrs.blockId ?? ''))

// ok 但 data 为空表示块已被删除/改名，同样标记失效
async function load(): Promise<void> {
  const result = await ctx.api.block.resolve(note.value, blockId.value)
  if (result.ok) {
    data.value = result.data
    failed.value = !result.data
  } else {
    failed.value = true
  }
}

async function open(event: MouseEvent): Promise<void> {
  event.stopPropagation()
  const block = data.value
  if (!block) return
  ctx.workspace.openNote(block.noteId, { blockId: block.blockId })
}

onMounted(load)
</script>

<template>
  <NodeViewWrapper as="div" class="embed-block" @click="open">
    <div class="embed-header">
      <Icon name="link" :size="14" />
      <span>来自 {{ note }}</span>
    </div>
    <div v-if="data" class="embed-body">{{ data.plainText }}</div>
    <div v-else-if="failed" class="embed-empty">引用已失效：![[{{ note }}#^{{ blockId }}]]</div>
    <div v-else class="embed-empty">加载中</div>
  </NodeViewWrapper>
</template>

<style scoped>
.embed-block {
  margin: 8px 0;
  padding: 8px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-menu);
  cursor: pointer;
}

.embed-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.embed-body {
  font-size: var(--font-size-body);
  color: var(--text-primary);
  white-space: pre-wrap;
}

.embed-empty {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
