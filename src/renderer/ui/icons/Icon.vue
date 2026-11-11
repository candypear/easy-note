<script setup lang="ts">
// 图标门面：用语义名（如 sidebar/folder）映射到 Lucide 组件，
// 业务侧不直接依赖图标库，换库或改图标只需改这里的映射表。
import { computed } from 'vue'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Code,
  Copy,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  File,
  Folder,
  FolderOpen,
  GripVertical,
  Heading,
  Italic,
  Link,
  List,
  ListTodo,
  Minus,
  Monitor,
  Moon,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Settings,
  Share2,
  Sigma,
  Square,
  Strikethrough,
  Sun,
  Table,
  Tag,
  Text,
  TextQuote,
  Trash,
  X,
  type LucideIcon
} from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number
    strokeWidth?: number
  }>(),
  { size: 16, strokeWidth: 1.5 }
)

// 语义名 → Lucide 组件映射；允许多个别名指向同一图标（如 x/close）
const ICONS: Record<string, LucideIcon> = {
  sidebar: PanelLeft,
  panelRight: PanelRight,
  source: Code,
  code: Code,
  inlineCode: Code,
  sun: Sun,
  moon: Moon,
  monitor: Monitor,
  settings: Settings,
  minimize: Minus,
  maximize: Square,
  restore: Copy,
  close: X,
  x: X,
  plus: Plus,
  insert: Plus,
  more: EllipsisVertical,
  dots: Ellipsis,
  grip: GripVertical,
  folder: Folder,
  folderOpen: FolderOpen,
  file: File,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  chevronLeft: ChevronLeft,
  graph: Share2,
  search: Search,
  tag: Tag,
  check: Check,
  copy: Copy,
  trash: Trash,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  link: Link,
  math: Sigma,
  heading: Heading,
  list: List,
  task: ListTodo,
  quote: TextQuote,
  table: Table,
  divider: Minus,
  paragraph: Text,
  external: ExternalLink,
  bold: Bold,
  italic: Italic,
  strike: Strikethrough,
  alignLeft: AlignLeft,
  alignCenter: AlignCenter,
  alignRight: AlignRight
}

const icon = computed(() => ICONS[props.name])
</script>

<template>
  <component
    :is="icon"
    v-if="icon"
    :size="props.size"
    :stroke-width="props.strokeWidth"
    :absolute-stroke-width="true"
    aria-hidden="true"
    focusable="false"
  />
</template>
