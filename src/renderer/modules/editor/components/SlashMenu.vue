<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type PropType } from 'vue'
import type { Editor } from '@tiptap/core'
import Icon from '../../../ui/icons/Icon.vue'

const props = defineProps({
  editor: { type: Object as PropType<Editor | null>, default: null },
  open: { type: Boolean, default: false },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  query: { type: String, default: '' },
  start: { type: Number, default: 0 }
})

const emit = defineEmits<{ close: [] }>()

interface Item {
  id: string
  label: string
  icon: string
  category: string
  run(editor: Editor): void
}

const items: Item[] = [
  { id: 'paragraph', label: '段落', icon: 'paragraph', category: '基础', run: (e) => e.chain().focus().setParagraph().run() },
  { id: 'h1', label: '标题 1', icon: 'heading', category: '标题', run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: 'h2', label: '标题 2', icon: 'heading', category: '标题', run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: 'h3', label: '标题 3', icon: 'heading', category: '标题', run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: 'bullet', label: '无序列表', icon: 'list', category: '列表', run: (e) => e.chain().focus().toggleBulletList().run() },
  { id: 'ordered', label: '有序列表', icon: 'list', category: '列表', run: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: 'task', label: '任务列表', icon: 'task', category: '列表', run: (e) => e.chain().focus().toggleTaskList().run() },
  { id: 'quote', label: '引用', icon: 'quote', category: '块', run: (e) => e.chain().focus().toggleBlockquote().run() },
  {
    id: 'code',
    label: '代码块',
    icon: 'code',
    category: '块',
    run: (e) => e.chain().focus().insertContent({ type: 'codeBlock', attrs: { language: null, code: '' } }).run()
  },
  {
    id: 'math',
    label: '公式块',
    icon: 'math',
    category: '块',
    run: (e) => e.chain().focus().insertContent({ type: 'mathBlock', attrs: { latex: '' } }).run()
  },
  {
    id: 'table',
    label: '表格',
    icon: 'table',
    category: '块',
    run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  },
  { id: 'divider', label: '分隔线', icon: 'divider', category: '块', run: (e) => e.chain().focus().setHorizontalRule().run() }
]

const active = ref(0)

const filtered = computed(() => {
  const query = props.query.trim().toLowerCase()
  if (!query) return items
  return items.filter((item) => item.label.toLowerCase().includes(query) || item.id.includes(query))
})

const menuHeight = computed(() =>
  Math.min(filtered.value.length * 32 + 10, 400, window.innerHeight - 16)
)
const top = computed(() => Math.max(8, Math.min(props.y, window.innerHeight - menuHeight.value - 8)))
const left = computed(() => Math.max(8, Math.min(props.x, window.innerWidth - 296)))

function select(item: Item): void {
  if (!props.editor) return
  const to = props.editor.state.selection.from
  if (props.start < to) {
    props.editor.chain().focus().deleteRange({ from: props.start, to }).run()
  }
  item.run(props.editor)
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = (active.value + 1) % Math.max(filtered.value.length, 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = (active.value - 1 + filtered.value.length) % Math.max(filtered.value.length, 1)
  } else if (event.key === 'Enter') {
    const item = filtered.value[active.value]
    if (item) {
      event.preventDefault()
      select(item)
    }
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="slash-menu no-drag" :style="{ left: `${left}px`, top: `${top}px` }" role="menu">
      <button
        v-for="(item, index) in filtered"
        :key="item.id"
        class="slash-item"
        :class="{ active: index === active }"
        type="button"
        @mouseenter="active = index"
        @mousedown.prevent="select(item)"
      >
        <Icon :name="item.icon" :size="16" />
        <span class="label">{{ item.label }}</span>
        <span class="category">{{ item.category }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.slash-menu {
  position: fixed;
  z-index: 55;
  width: 280px;
  max-height: min(400px, calc(100vh - 16px));
  overflow: auto;
  padding: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-menu);
  box-shadow: var(--shadow-menu);
}

.slash-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border-radius: var(--radius-input);
  font-size: 13px;
  color: var(--text-menu);
  text-align: left;
}

.slash-item:hover,
.slash-item.active {
  background: var(--bg-hover);
}

.label {
  flex: 1;
}

.category {
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
