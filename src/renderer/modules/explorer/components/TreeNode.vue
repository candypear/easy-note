<script setup lang="ts">
// 递归树节点：同一组件渲染文件夹或笔记（二选一 prop），展开时递归渲染子节点；
// 重命名/右键/拖拽等交互只发事件，由 FileTree 容器集中裁决，自身不持业务状态。
import { computed, nextTick, ref, watch, type PropType } from 'vue'
import type { FolderNode } from '@shared/contracts/folder'
import { asNoteId } from '@shared/types/brand'
import type { NoteSummary } from '@shared/contracts/note'
import type { ExplorerState } from '../stores/explorer-store'
import type { TreeActions, DragPayload } from '../composables/useFileTree'
import Icon from '../../../ui/icons/Icon.vue'

const props = defineProps({
  folder: { type: Object as PropType<FolderNode | undefined>, default: undefined },
  note: { type: Object as PropType<NoteSummary | undefined>, default: undefined },
  depth: { type: Number, required: true },
  state: { type: Object as PropType<ExplorerState>, required: true },
  actions: { type: Object as PropType<TreeActions>, required: true },
  editingPath: { type: String as PropType<string | null>, default: null },
  editingValue: { type: String, default: '' },
  dragTarget: { type: String as PropType<string | null>, default: null }
})

// 事件协议：子层 TreeNode 在模板中把这些事件原样转发，逐层冒泡到 FileTree
const emit = defineEmits<{
  'update:editingValue': [value: string]
  'start-rename': [kind: 'folder' | 'note', path: string, noteId: string | null, name: string]
  'finish-rename': [kind: 'folder' | 'note', path: string, noteId: string | null]
  'cancel-rename': []
  'context-menu': [event: MouseEvent, kind: 'folder' | 'note', path: string, noteId: string | null, name: string]
  'drag-target': [path: string | null]
  'drop-item': [payload: DragPayload, targetPath: string | null]
}>()

const input = ref<HTMLInputElement | null>(null)
// 展开态取自共享的 expanded 集合而非本地状态，保证"折叠全部"等全局操作生效
const expanded = computed(() => !!props.folder && props.state.expanded.has(props.folder.path))
const isEditing = computed(() => props.editingPath === (props.folder?.path ?? props.note?.path ?? ''))

watch(
  isEditing,
  async (value) => {
    if (!value) return
    // 等 input 渲染完成后聚焦并全选文件名，便于直接覆盖输入
    await nextTick()
    input.value?.focus()
    input.value?.select()
  },
  { immediate: true }
)

function toggleFolder(event: MouseEvent): void {
  // 阻止冒泡，避免箭头点击同时触发行的选中逻辑
  event.stopPropagation()
  if (props.folder) props.actions.toggle(props.folder.path)
}

function onClick(): void {
  // 单击文件夹只选中不展开（展开靠箭头/双击）；单击笔记直接打开
  if (props.folder) {
    props.state.selectedPath = props.folder.path
    props.state.selectedKind = 'folder'
    props.state.selectedNoteId = null
  } else if (props.note) {
    props.actions.openNote(props.note.id, props.note.path)
  }
}

function onContext(event: MouseEvent): void {
  // 右键先选中目标节点再上抛菜单事件，保证菜单动作作用于所指节点
  if (props.folder) {
    props.state.selectedPath = props.folder.path
    props.state.selectedKind = 'folder'
    props.state.selectedNoteId = null
    emit('context-menu', event, 'folder', props.folder.path, null, props.folder.name)
  } else if (props.note) {
    props.state.selectedPath = props.note.path
    props.state.selectedKind = 'note'
    props.state.selectedNoteId = asNoteId(props.note.id)
    emit('context-menu', event, 'note', props.note.path, props.note.id, props.note.title)
  }
}

function onKeydown(event: KeyboardEvent): void {
  // 行聚焦时的键盘交互：F2 重命名、Enter 打开笔记
  if (event.key === 'F2') {
    event.preventDefault()
    if (props.folder) {
      emit('start-rename', 'folder', props.folder.path, null, props.folder.name)
    } else if (props.note) {
      emit('start-rename', 'note', props.note.path, props.note.id, props.note.title)
    }
  }
  if (event.key === 'Enter' && props.note) {
    event.preventDefault()
    props.actions.openNote(props.note.id, props.note.path)
  }
}

function onRenameKeydown(event: KeyboardEvent): void {
  // 编辑框内：Enter 提交、Esc 取消；失焦提交由模板 blur 绑定兜底
  if (event.key === 'Enter') {
    event.preventDefault()
    if (props.folder) emit('finish-rename', 'folder', props.folder.path, null)
    else if (props.note) emit('finish-rename', 'note', props.note.path, props.note.id)
  }
  if (event.key === 'Escape') emit('cancel-rename')
}

function onDragStart(event: DragEvent): void {
  // 用自定义 MIME 携带 JSON 载荷（类型/路径/id），与外部文件拖拽区分开
  const payload: DragPayload = props.folder
    ? { kind: 'folder', path: props.folder.path, noteId: null }
    : { kind: 'note', path: props.note?.path ?? '', noteId: props.note?.id ?? null }
  event.dataTransfer?.setData('application/x-easynote', JSON.stringify(payload))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event: DragEvent): void {
  // 只有文件夹能作为落点；preventDefault 表示接受放置，
  // stopPropagation 防止冒泡到树根被当作"移到库根"
  if (!props.folder) return
  event.preventDefault()
  event.stopPropagation()
  emit('drag-target', props.folder.path)
}

function onDrop(event: DragEvent): void {
  // 解析载荷后上抛给容器执行移动；无论成败都清除落点高亮
  if (!props.folder) return
  event.preventDefault()
  event.stopPropagation()
  const raw = event.dataTransfer?.getData('application/x-easynote')
  if (!raw) return
  try {
    const payload = JSON.parse(raw) as DragPayload
    emit('drop-item', payload, props.folder.path)
  } catch {
    // 拖拽数据非法时忽略
  }
  emit('drag-target', null)
}

function onDragLeave(): void {
  emit('drag-target', null)
}
</script>

<template>
  <div class="tree-node" :draggable="!isEditing" @dragstart="onDragStart" @dragend="emit('drag-target', null)">
    <div
      v-if="props.folder"
      class="row folder-row"
      :class="{
        selected: props.state.selectedPath === props.folder.path,
        'drop-target': props.dragTarget === props.folder.path
      }"
      :style="{ paddingLeft: `${props.depth * 16 + 6}px` }"
      role="treeitem"
      :aria-expanded="expanded"
      tabindex="0"
      @click="onClick"
      @dblclick="toggleFolder"
      @contextmenu.prevent="onContext"
      @keydown="onKeydown"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <button class="chevron" :class="{ open: expanded }" type="button" @click="toggleFolder">
        <Icon name="chevronRight" :size="14" />
      </button>
      <Icon :name="expanded ? 'folderOpen' : 'folder'" :size="16" class="row-icon" />
      <input
        v-if="isEditing"
        ref="input"
        class="rename"
        :value="props.editingValue"
        spellcheck="false"
        @input="emit('update:editingValue', ($event.target as HTMLInputElement).value)"
        @keydown="onRenameKeydown"
        @blur="emit('finish-rename', 'folder', props.folder.path, null)"
        @click.stop
      />
      <span v-else class="label">{{ props.folder.name }}</span>
    </div>

    <div
      v-else-if="props.note"
      class="row note-row"
      :class="{ selected: props.state.selectedNoteId === props.note.id }"
      :style="{ paddingLeft: `${props.depth * 16 + 26}px` }"
      role="treeitem"
      tabindex="0"
      @click="onClick"
      @contextmenu.prevent="onContext"
      @keydown="onKeydown"
    >
      <Icon name="file" :size="16" class="row-icon" />
      <input
        v-if="isEditing"
        ref="input"
        class="rename"
        :value="props.editingValue"
        spellcheck="false"
        @input="emit('update:editingValue', ($event.target as HTMLInputElement).value)"
        @keydown="onRenameKeydown"
        @blur="emit('finish-rename', 'note', props.note.path, props.note.id)"
        @click.stop
      />
      <span v-else class="label">{{ props.note.title }}</span>
    </div>

    <template v-if="props.folder && expanded">
      <div
        v-for="childFolder in props.folder.children"
        :key="childFolder.path"
        class="child"
      >
        <TreeNode
          :folder="childFolder"
          :depth="props.depth + 1"
          :state="props.state"
          :actions="props.actions"
          :editing-path="props.editingPath"
          :editing-value="props.editingValue"
          :drag-target="props.dragTarget"
          @update:editing-value="emit('update:editingValue', $event)"
          @start-rename="(...args) => emit('start-rename', ...args)"
          @finish-rename="(...args) => emit('finish-rename', ...args)"
          @cancel-rename="emit('cancel-rename')"
          @context-menu="(...args) => emit('context-menu', ...args)"
          @drag-target="emit('drag-target', $event)"
          @drop-item="(payload, target) => emit('drop-item', payload, target)"
        />
      </div>
      <div
        v-for="childNote in props.folder.notes"
        :key="childNote.id"
        class="child"
      >
        <TreeNode
          :note="childNote"
          :depth="props.depth + 1"
          :state="props.state"
          :actions="props.actions"
          :editing-path="props.editingPath"
          :editing-value="props.editingValue"
          :drag-target="props.dragTarget"
          @update:editing-value="emit('update:editingValue', $event)"
          @start-rename="(...args) => emit('start-rename', ...args)"
          @finish-rename="(...args) => emit('finish-rename', ...args)"
          @cancel-rename="emit('cancel-rename')"
          @context-menu="(...args) => emit('context-menu', ...args)"
          @drag-target="emit('drag-target', $event)"
          @drop-item="(payload, target) => emit('drop-item', payload, target)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding-right: 6px;
  border-radius: var(--radius-input);
  font-size: var(--font-size-ui);
  color: var(--text-primary);
  user-select: none;
}

.row:hover {
  background: var(--bg-hover);
}

.row.selected {
  background: var(--bg-selected);
}

.row.drop-target {
  background: var(--bg-selected);
  outline: 1px solid var(--accent);
}

.chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--text-tertiary);
  transition: transform var(--duration-hover) ease-out;
}

.chevron.open {
  transform: rotate(90deg);
}

.row-icon {
  flex: none;
  color: var(--text-tertiary);
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 4px;
  background: var(--bg-app);
  border: 1px solid var(--accent);
  border-radius: var(--radius-inline);
  font-size: 13px;
  outline: none;
}
</style>
