<script setup lang="ts">
// 斜杠命令菜单：展示可插入的块类型，支持按查询词过滤、键盘上下选择，
// 选中后先删除已输入的 "/查询词" 再执行对应插入命令；右侧联动预览面板。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue'
import type { Editor } from '@tiptap/core'
import Icon from '../../../ui/icons/Icon.vue'
import SlashPreview from './SlashPreview.vue'

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

// 菜单项清单：label 为中文名，id 兼作英文搜索关键字，run 是选中后执行的 TipTap 命令
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

const MENU_WIDTH = 280
const PREVIEW_WIDTH = 248
const PREVIEW_HEIGHT = 170

// 过滤规则：中文 label 或英文 id 包含查询词即匹配（不区分大小写）
const filtered = computed(() => {
  const query = props.query.trim().toLowerCase()
  if (!query) return items
  return items.filter((item) => item.label.toLowerCase().includes(query) || item.id.includes(query))
})

// 菜单定位：按内容估算高度并把坐标夹在视口内，避免超出屏幕
const menuHeight = computed(() =>
  Math.min(filtered.value.length * 32 + 10, 400, window.innerHeight - 16)
)
const top = computed(() => Math.max(8, Math.min(props.y, window.innerHeight - menuHeight.value - 8)))
const left = computed(() => Math.max(8, Math.min(props.x, window.innerWidth - MENU_WIDTH - 16)))

const activeItem = computed(() => filtered.value[active.value])
const menuRef = ref<HTMLElement | null>(null)
const previewTop = ref(0)

// 预览面板优先放菜单右侧，放不下则翻到左侧，仍放不下就贴近视口右缘
const previewLeft = computed(() => {
  const right = left.value + MENU_WIDTH + 8
  if (right + PREVIEW_WIDTH <= window.innerWidth - 8) return right
  const flipped = left.value - PREVIEW_WIDTH - 8
  if (flipped >= 8) return flipped
  return Math.max(8, window.innerWidth - PREVIEW_WIDTH - 8)
})

// 让预览面板垂直对齐当前高亮项：先按行高估算，DOM 更新后再用真实
// getBoundingClientRect 修正（菜单可能已滚动，估算位置会偏差）。
async function syncPreviewTop(): Promise<void> {
  previewTop.value = Math.max(
    8,
    Math.min(top.value + 5 + active.value * 32, window.innerHeight - PREVIEW_HEIGHT - 8)
  )
  await nextTick()
  const item = menuRef.value?.querySelector<HTMLElement>('.slash-item.active')
  if (!item) return
  previewTop.value = Math.max(
    8,
    Math.min(item.getBoundingClientRect().top, window.innerHeight - PREVIEW_HEIGHT - 8)
  )
}

watch([() => props.open, active, top, filtered], () => void syncPreviewTop(), { immediate: true })

// 过滤结果变短时把高亮索引重置，避免指向不存在的项
watch(filtered, () => {
  if (active.value >= filtered.value.length) active.value = 0
})

// 执行命令前先删掉从斜杠触发位置 start 到当前光标之间的 "/查询词" 文本
function select(item: Item): void {
  if (!props.editor) return
  const to = props.editor.state.selection.from
  if (props.start < to) {
    props.editor.chain().focus().deleteRange({ from: props.start, to }).run()
  }
  item.run(props.editor)
  emit('close')
}

// 键盘导航：上下键循环移动高亮，Enter 确认，Esc 关闭；
// 以捕获阶段监听 document，抢在 ProseMirror 处理这些按键之前拦截。
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
    <div
      v-if="props.open"
      ref="menuRef"
      class="slash-menu no-drag"
      :style="{ left: `${left}px`, top: `${top}px` }"
      role="menu"
      @scroll="syncPreviewTop"
    >
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
    <SlashPreview
      v-if="props.open && activeItem"
      :item-id="activeItem.id"
      :label="activeItem.label"
      :left="previewLeft"
      :top="previewTop"
    />
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
