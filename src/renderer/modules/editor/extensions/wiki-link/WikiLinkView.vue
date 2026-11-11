<script setup lang="ts">
// wiki 链接 NodeView：解析目标笔记是否存在（不存在显示虚线"未创建"样式），
// 点击打开目标笔记，目标缺失则先创建；订阅索引更新事件实时刷新存在状态。
import { NodeViewWrapper } from '@tiptap/vue-3'
import { computed, onBeforeUnmount, onMounted, ref, type PropType } from 'vue'
import { useContext } from '../../../../app/providers'
import { onWikiIndexUpdated } from './index-events'

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
const missing = ref(false)
let off: (() => void) | null = null

const target = computed(() => String(props.node.attrs.target ?? ''))

// 通过主进程链接索引解析标题 → 笔记；解析不到即视为未创建
async function check(): Promise<void> {
  const result = await ctx.api.link.resolveTarget(target.value)
  missing.value = !result.ok || !result.data
}

// 点击时重新解析（可能刚被创建/重命名）；目标不存在则按链接文本新建笔记再打开
async function open(event: MouseEvent): Promise<void> {
  event.stopPropagation()
  event.preventDefault()
  const result = await ctx.api.link.resolveTarget(target.value)
  if (result.ok && result.data) {
    ctx.workspace.openNote(result.data.noteId)
    return
  }
  const created = await ctx.api.note.create(null, target.value)
  if (created.ok) ctx.workspace.openNote(created.data.id)
}

onMounted(() => {
  void check()
  // 共享订阅：索引变化（新建/重命名/删除笔记）时重新校验目标是否存在
  off = onWikiIndexUpdated(ctx, () => void check())
})

onBeforeUnmount(() => {
  off?.()
})
</script>

<template>
  <NodeViewWrapper as="span"
    class="wiki-link"
    :class="{ missing }"
    :title="missing ? '未创建' : target"
    @click="open"
  >
    {{ target }}
  </NodeViewWrapper>
</template>

<style scoped>
.wiki-link {
  color: var(--accent);
  cursor: pointer;
  text-decoration: none;
  border-bottom: 1px solid transparent;
}

.wiki-link:hover {
  border-bottom-color: var(--accent);
}

.wiki-link.missing {
  color: var(--text-secondary);
  text-decoration: underline dotted var(--text-tertiary);
}
</style>
