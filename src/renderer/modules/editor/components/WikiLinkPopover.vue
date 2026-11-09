<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue'
import type { Editor } from '@tiptap/core'
import type { QuickSwitchHit } from '@shared/contracts/search'
import { asNoteId } from '@shared/types/brand'
import { useContext } from '../../../app/providers'
import Icon from '../../../ui/icons/Icon.vue'

const props = defineProps({
  editor: { type: Object as PropType<Editor | null>, default: null },
  open: { type: Boolean, default: false },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  query: { type: String, default: '' },
  range: {
    type: Object as PropType<{ from: number; to: number } | null>,
    default: null
  },
  mode: { type: String as PropType<'wiki' | 'embed'>, default: 'wiki' }
})

const emit = defineEmits<{ close: [] }>()
const ctx = useContext()
const results = ref<QuickSwitchHit[]>([])
const active = ref(0)
const loading = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

const top = computed(() => Math.max(8, Math.min(props.y, window.innerHeight - 360)))
const left = computed(() => Math.max(8, Math.min(props.x, window.innerWidth - 328)))
const canCreate = computed(
  () =>
    props.query.trim().length > 0 &&
    !results.value.some((item) => item.title === props.query.trim())
)

async function search(query: string): Promise<void> {
  loading.value = true
  const result = await ctx.api.search.quickSwitch(query)
  loading.value = false
  if (result.ok) results.value = result.data.slice(0, 8)
}

watch(
  () => [props.open, props.query] as const,
  ([open, query]) => {
    if (!open) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void search(query), 120)
  },
  { immediate: true }
)

function insert(title: string, noteId: string | null): void {
  if (!props.editor || !props.range) return
  const range = props.range
  if (props.mode === 'embed' && noteId) {
    onEmbed(noteId, title)
    return
  }
  props.editor
    .chain()
    .focus()
    .insertContentAt({ from: range.from, to: range.to }, { type: 'wikiLink', attrs: { target: title } })
    .insertContent(' ')
    .run()
  emit('close')
}

async function onEmbed(noteId: string, title: string): Promise<void> {
  const blocks = await ctx.api.block.listByNote(asNoteId(noteId))
  const first = blocks.ok ? blocks.data[0] : undefined
  if (!props.editor || !props.range || !first) {
    emit('close')
    return
  }
  props.editor
    .chain()
    .focus()
    .insertContentAt(
      { from: props.range.from, to: props.range.to },
      { type: 'embedBlock', attrs: { note: title, blockId: first.id } }
    )
    .run()
  emit('close')
}

async function select(item: QuickSwitchHit | null | undefined): Promise<void> {
  if (item) {
    insert(item.title, item.noteId)
    return
  }
  if (item === undefined) return
  const title = props.query.trim()
  if (!title) return
  const created = await ctx.api.note.create(null, title)
  if (created.ok) {
    insert(title, created.data.id)
    ctx.workspace.openNote(created.data.id)
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  const total = results.value.length + (canCreate.value ? 1 : 0)
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = (active.value + 1) % Math.max(total, 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = (active.value - 1 + total) % Math.max(total, 1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const item = results.value[active.value]
    void select(item ?? (canCreate.value ? null : undefined))
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="wiki-popover no-drag" :style="{ left: `${left}px`, top: `${top}px` }">
      <div class="query">
        <Icon name="search" :size="14" />
        <span>{{ props.query || '搜索笔记' }}</span>
      </div>
      <div class="results">
        <button
          v-for="(item, index) in results"
          :key="item.noteId"
          class="result"
          :class="{ active: index === active }"
          type="button"
          @mouseenter="active = index"
          @mousedown.prevent="select(item)"
        >
          <span class="title">{{ item.title }}</span>
          <span class="path">{{ item.path }}</span>
        </button>
        <button
          v-if="canCreate"
          class="result create"
          :class="{ active: active === results.length }"
          type="button"
          @mouseenter="active = results.length"
          @mousedown.prevent="select(null)"
        >
          创建「{{ props.query.trim() }}」
        </button>
        <div v-if="loading" class="loading">搜索中</div>
      </div>
      <div class="hint">↑↓ 选择 · Enter 插入 · Esc 关闭</div>
    </div>
  </Teleport>
</template>

<style scoped>
.wiki-popover {
  position: fixed;
  z-index: 55;
  width: 320px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-menu);
  box-shadow: var(--shadow-menu);
  overflow: hidden;
}

.query {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
}

.results {
  max-height: 280px;
  overflow: auto;
  padding: 4px;
}

.result {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 4px 8px;
  border-radius: var(--radius-input);
  text-align: left;
}

.result:hover,
.result.active {
  background: var(--bg-hover);
}

.title {
  font-size: 13px;
}

.path {
  font-size: 11px;
  color: var(--text-tertiary);
}

.create {
  color: var(--accent);
  font-size: 13px;
}

.loading {
  padding: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.hint {
  height: 28px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
