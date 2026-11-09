<script setup lang="ts">
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

async function check(): Promise<void> {
  const result = await ctx.api.link.resolveTarget(target.value)
  missing.value = !result.ok || !result.data
}

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
