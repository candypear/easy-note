<script setup lang="ts">
// 文件树容器：持有树状态与动作，集中管理右键菜单、行内重命名、删除确认、
// 拖拽落点高亮；子节点交互经 TreeNode 事件冒泡到这里统一处理。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useContext } from '../../../app/providers'
import BaseButton from '../../../ui/button/BaseButton.vue'
import BaseDialog from '../../../ui/dialog/BaseDialog.vue'
import BaseMenu, { type MenuItem } from '../../../ui/menu/BaseMenu.vue'
import Icon from '../../../ui/icons/Icon.vue'
import TreeNode from './TreeNode.vue'
import type { DragPayload } from '../composables/useFileTree'
import { createTreeActions } from '../composables/useFileTree'
import { countNotes, createExplorerState } from '../stores/explorer-store'
import type { FolderNode } from '@shared/contracts/folder'
import type { NoteSummary } from '@shared/contracts/note'
import { asNoteId } from '@shared/types/brand'
import { toast } from '../../../ui'

const ctx = useContext()
const { t } = ctx.i18n
const state = createExplorerState()
const actions = createTreeActions(ctx, state)
const stops: (() => void)[] = []

interface MenuState {
  open: boolean
  x: number
  y: number
  kind: 'folder' | 'note' | 'new' | 'more'
  path: string
  noteId: string | null
  name: string
}

const menu = ref<MenuState>({
  open: false,
  x: 0,
  y: 0,
  kind: 'new',
  path: '',
  noteId: null,
  name: ''
})

// 行内重命名状态提升到容器：同一时刻只允许一个节点处于编辑态
const editingPath = ref<string | null>(null)
const editingValue = ref('')
// 当前拖拽悬停的目标文件夹路径，用于高亮落点
const dragTarget = ref<string | null>(null)
const confirm = ref<{
  open: boolean
  kind: 'folder' | 'note'
  path: string
  noteId: string | null
  name: string
  count: number
}>({ open: false, kind: 'note', path: '', noteId: null, name: '', count: 0 })

function findNote(noteId: string | null): NoteSummary | null {
  if (!noteId) return null
  const walk = (folders: FolderNode[]): NoteSummary | null => {
    for (const folder of folders) {
      const hit = folder.notes.find((note) => note.id === noteId)
      if (hit) return hit
      const nested = walk(folder.children)
      if (nested) return nested
    }
    return null
  }
  return state.tree.notes.find((note) => note.id === noteId) ?? walk(state.tree.folders)
}

function findFolder(path: string | null): FolderNode | null {
  if (!path) return null
  const walk = (folders: FolderNode[]): FolderNode | null => {
    for (const folder of folders) {
      if (folder.path === path) return folder
      const nested = walk(folder.children)
      if (nested) return nested
    }
    return null
  }
  return walk(state.tree.folders)
}

function parentForNew(): string | null {
  // 新建位置跟随选中项：选中文件夹→其内；选中笔记→同级目录；否则库根
  if (state.selectedKind === 'folder') return state.selectedPath
  if (state.selectedKind === 'note') return findNote(state.selectedNoteId)?.folderPath ?? null
  return null
}

// 四种菜单共用一个 BaseMenu 实例，按 kind 切换菜单项，避免多实例叠加
const menuItems = computed<MenuItem[]>(() => {
  if (menu.value.kind === 'new') {
    return [
      { id: 'new-note', label: t('explorer.newNote'), icon: 'file' },
      { id: 'new-folder', label: t('explorer.newFolder'), icon: 'folder' }
    ]
  }
  if (menu.value.kind === 'more') {
    return [
      { id: 'sort', label: t('explorer.sortByName') },
      { id: 'collapse', label: t('explorer.collapseAll') }
    ]
  }
  if (menu.value.kind === 'folder') {
    return [
      { id: 'new-note', label: t('explorer.newNote'), icon: 'file' },
      { id: 'new-folder', label: t('explorer.newFolder'), icon: 'folder' },
      { id: 'sep', label: '', separator: true },
      { id: 'rename', label: t('explorer.rename') },
      { id: 'delete', label: t('explorer.delete'), danger: true }
    ]
  }
  return [
    { id: 'open', label: t('explorer.open') },
    { id: 'rename', label: t('explorer.rename') },
    { id: 'duplicate', label: t('explorer.duplicate') },
    { id: 'sep', label: '', separator: true },
    { id: 'delete', label: t('explorer.delete'), danger: true }
  ]
})

function openMenu(event: MouseEvent, kind: MenuState['kind'], path: string, noteId: string | null, name: string): void {
  event.preventDefault()
  event.stopPropagation()
  menu.value = { open: true, x: event.clientX, y: event.clientY, kind, path, noteId, name }
}

function openToolbarMenu(event: MouseEvent, kind: 'new' | 'more'): void {
  // 工具栏菜单锚定按钮："新建"左对齐，"更多"右对齐（菜单宽约 180px）
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  menu.value = {
    open: true,
    x: kind === 'new' ? rect.left : rect.right - 180,
    y: rect.bottom + 4,
    kind,
    path: '',
    noteId: null,
    name: ''
  }
}

function startRename(kind: 'folder' | 'note', path: string, noteId: string | null, name: string): void {
  // 进入编辑态前先选中该节点，保证视觉上编辑行与选中行一致
  editingPath.value = path
  editingValue.value = name
  if (kind === 'folder') {
    state.selectedPath = path
    state.selectedKind = 'folder'
    state.selectedNoteId = null
  } else if (noteId) {
    state.selectedPath = path
    state.selectedKind = 'note'
    state.selectedNoteId = asNoteId(noteId)
  }
}

async function finishRename(kind: 'folder' | 'note', path: string, noteId: string | null): Promise<void> {
  const value = editingValue.value
  // 先退出编辑态再异步提交：Enter 与 blur 可能先后触发，避免重复提交
  editingPath.value = null
  if (!value.trim()) return
  const ok = await actions.rename(kind, path, noteId, value)
  if (!ok) toast(t('menu.error', { message: '' }), 'error')
}

function requestDelete(kind: 'folder' | 'note', path: string, noteId: string | null, name: string): void {
  // 删除一律先弹确认框；文件夹附带递归笔记数，让用户明确影响范围
  const folder = kind === 'folder' ? findFolder(path) : null
  confirm.value = {
    open: true,
    kind,
    path,
    noteId,
    name,
    count: folder ? countNotes(folder) : 0
  }
}

async function confirmDelete(): Promise<void> {
  const current = confirm.value
  // 删除走系统回收站（主进程实现）；失败多因系统不支持回收站，按此提示
  const ok = await actions.remove(current.kind, current.path, current.noteId)
  confirm.value = { ...current, open: false }
  if (!ok) toast(t('menu.trashUnavailable'), 'error')
}

async function onMenuSelect(id: string): Promise<void> {
  const current = menu.value
  // 先关菜单再执行动作，动作可能弹对话框/进入编辑态，避免菜单残留
  menu.value = { ...current, open: false }
  if (id === 'new-note') {
    await actions.createNote(current.kind === 'folder' ? current.path : parentForNew())
  } else if (id === 'new-folder') {
    await actions.createFolder(current.kind === 'folder' ? current.path : parentForNew())
  } else if (id === 'sort') {
    actions.toggleSort()
  } else if (id === 'collapse') {
    actions.collapseAll()
  } else if (id === 'open' && current.noteId) {
    actions.openNote(current.noteId, current.path)
  } else if (id === 'rename') {
    startRename(current.kind as 'folder' | 'note', current.path, current.noteId, current.name)
  } else if (id === 'duplicate' && current.noteId) {
    const result = await ctx.api.note.duplicate(asNoteId(current.noteId))
    if (result.ok) await actions.reload()
  } else if (id === 'delete') {
    requestDelete(current.kind as 'folder' | 'note', current.path, current.noteId, current.name)
  }
}

async function onDropItem(payload: DragPayload, target: string | null): Promise<void> {
  // target 为 null 表示移到库根；文件夹落到自身直接忽略，
  // 更深的循环校验（移入后代）由主进程兜底
  dragTarget.value = null
  if (payload.kind === 'folder') {
    if (payload.path === target) return
    await actions.moveFolder(payload.path, target)
  } else if (payload.noteId) {
    await actions.moveNote(payload.noteId, target)
  }
}

function onRootDrop(event: DragEvent): void {
  // 树空白处兜底落点：未命中任何文件夹时移动到库根；
  // 只接受自定义 MIME 类型，忽略外部文件拖入
  event.preventDefault()
  dragTarget.value = null
  const raw = event.dataTransfer?.getData('application/x-easynote')
  if (!raw) return
  try {
    const payload = JSON.parse(raw) as DragPayload
    void onDropItem(payload, null)
  } catch {
    // 拖拽数据非法时忽略，不影响树状态
  }
}

let reloadTimer: number | undefined
function scheduleReload(): void {
  // 120ms 防抖：批量文件变更/索引更新会连发多个事件，合并为一次整树重载
  clearTimeout(reloadTimer)
  reloadTimer = window.setTimeout(() => void actions.reload(), 120)
}

onMounted(() => {
  // 先还原展开状态再拉树，避免渲染时全部折叠再跳开；
  // 库切换立即重载，其余文件/索引事件走防抖通道
  actions.restoreExpanded()
  if (ctx.shell.state.vaultOpen) void actions.reload()
  stops.push(ctx.events.on('vault:changed', () => void actions.reload()))
  stops.push(ctx.events.on('folder:changed', scheduleReload))
  stops.push(ctx.events.on('note:created', scheduleReload))
  stops.push(ctx.events.on('note:renamed', scheduleReload))
  stops.push(ctx.events.on('note:deleted', scheduleReload))
  stops.push(ctx.events.on('index:updated', scheduleReload))
})

onBeforeUnmount(() => {
  for (const stop of stops) stop()
  clearTimeout(reloadTimer)
})
</script>

<template>
  <div class="file-tree">
    <div class="toolbar">
      <button class="toolbar-button" type="button" @click="openToolbarMenu($event, 'new')">
        <Icon name="plus" :size="16" />
        <span>{{ t('explorer.new') }}</span>
      </button>
      <button class="icon-button" type="button" :aria-label="t('explorer.more')" @click="openToolbarMenu($event, 'more')">
        <Icon name="dots" :size="16" />
      </button>
    </div>

    <div class="tree" role="tree" @dragover.prevent @drop="onRootDrop">
      <div
        v-for="folder in state.tree.folders"
        :key="folder.path"
      >
        <TreeNode
          :folder="folder"
          :depth="0"
          :state="state"
          :actions="actions"
          :editing-path="editingPath"
          :editing-value="editingValue"
          :drag-target="dragTarget"
          @update:editing-value="editingValue = $event"
          @start-rename="startRename"
          @finish-rename="finishRename"
          @cancel-rename="editingPath = null"
          @context-menu="openMenu"
          @drag-target="dragTarget = $event"
          @drop-item="onDropItem"
        />
      </div>
      <div v-for="note in state.tree.notes" :key="note.id">
        <TreeNode
          :note="note"
          :depth="0"
          :state="state"
          :actions="actions"
          :editing-path="editingPath"
          :editing-value="editingValue"
          :drag-target="dragTarget"
          @update:editing-value="editingValue = $event"
          @start-rename="startRename"
          @finish-rename="finishRename"
          @cancel-rename="editingPath = null"
          @context-menu="openMenu"
          @drag-target="dragTarget = $event"
          @drop-item="onDropItem"
        />
      </div>

      <div v-if="!state.loading && state.tree.folders.length === 0 && state.tree.notes.length === 0" class="empty">
        <p>{{ t('explorer.emptyVault') }}</p>
        <BaseButton variant="ghost" size="sm" @click="actions.createNote(null)">
          {{ t('explorer.newNote') }}
        </BaseButton>
      </div>
    </div>

    <BaseMenu
      :open="menu.open"
      :x="menu.x"
      :y="menu.y"
      :items="menuItems"
      @select="onMenuSelect"
      @close="menu.open = false"
    />

    <BaseDialog
      :open="confirm.open"
      :title="confirm.kind === 'note' ? t('menu.deleteNote') : t('menu.deleteFolder')"
      @close="confirm.open = false"
    >
      <p>
        {{
          confirm.kind === 'note'
            ? t('menu.deleteNoteBody', { name: confirm.name })
            : t('menu.deleteFolderBody', { name: confirm.name, count: confirm.count })
        }}
      </p>
      <template #footer>
        <BaseButton variant="ghost" @click="confirm.open = false">{{ t('menu.cancel') }}</BaseButton>
        <BaseButton variant="danger" @click="confirmDelete">{{ t('menu.confirm') }}</BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.file-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 32px;
  padding: 0 4px;
  flex: none;
}

.toolbar-button,
.icon-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 6px;
  border-radius: var(--radius-input);
  color: var(--text-secondary);
  font-size: 13px;
}

.toolbar-button {
  flex: 1;
  justify-content: flex-start;
}

.icon-button {
  justify-content: center;
  width: 28px;
}

.toolbar-button:hover,
.icon-button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 4px 8px;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 8px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
}

.empty p {
  margin: 0;
}
</style>
