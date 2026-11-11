<script setup lang="ts">
// 标签视图：展示全库标签及引用计数（聚合由主进程索引完成），支持多选标签
// 按 and/or 组合筛选笔记，以及右键重命名/删除标签（会改写所有引用该标签的笔记）。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { NoteSummary } from '@shared/contracts/note'
import type { TagDTO, TagFilterMode } from '@shared/contracts/tag'
import { asNoteId } from '@shared/types/brand'
import { useContext } from '../../../app/providers'
import BaseDialog from '../../../ui/dialog/BaseDialog.vue'
import BaseButton from '../../../ui/button/BaseButton.vue'
import BaseMenu, { type MenuItem } from '../../../ui/menu/BaseMenu.vue'
import Icon from '../../../ui/icons/Icon.vue'
import { toast } from '../../../ui'

const ctx = useContext()
const { t } = ctx.i18n
const tags = ref<TagDTO[]>([])
// 已勾选的标签名集合与组合方式（and=全部命中，or=命中任一）
const selected = ref<string[]>([])
const mode = ref<TagFilterMode>('and')
const results = ref<NoteSummary[]>([])
// editing 为正在行内重命名的标签名（null 表示无），menu/confirm 为右键菜单与删除确认框状态
const editing = ref<string | null>(null)
const editingValue = ref('')
const menu = ref({ open: false, x: 0, y: 0, name: '' })
const confirm = ref({ open: false, name: '' })

const menuItems = computed<MenuItem[]>(() => [
  { id: 'rename', label: t('tags.rename') },
  { id: 'delete', label: t('tags.delete'), danger: true }
])

async function loadTags(): Promise<void> {
  const result = await ctx.api.tag.list()
  if (result.ok) tags.value = result.data
}

// 按当前勾选的标签筛选笔记；未勾选任何标签时清空结果而不发请求
async function applyFilter(): Promise<void> {
  if (selected.value.length === 0) {
    results.value = []
    return
  }
  const result = await ctx.api.tag.filter([...selected.value], mode.value)
  if (result.ok) results.value = result.data.notes
}

// 点击标签行：切换勾选状态并立即重新筛选
async function toggle(name: string): Promise<void> {
  const index = selected.value.indexOf(name)
  if (index >= 0) selected.value.splice(index, 1)
  else selected.value.push(name)
  await applyFilter()
}

async function changeMode(next: TagFilterMode): Promise<void> {
  mode.value = next
  await applyFilter()
}

function clear(): void {
  selected.value = []
  results.value = []
}

// 右键标签行：在鼠标位置弹出重命名/删除菜单
function openMenu(event: MouseEvent, name: string): void {
  event.preventDefault()
  menu.value = { open: true, x: event.clientX, y: event.clientY, name }
}

async function onMenuSelect(id: string): Promise<void> {
  const name = menu.value.name
  menu.value = { ...menu.value, open: false }
  if (id === 'rename') {
    // 进入行内编辑：输入框预填原名
    editing.value = name
    editingValue.value = name
  } else if (id === 'delete') {
    confirm.value = { open: true, name }
  }
}

// 提交重命名（回车或失焦触发）：主进程会同步改写所有笔记中的该标签
async function submitRename(): Promise<void> {
  const oldName = editing.value
  const next = editingValue.value.trim()
  editing.value = null
  // 空名或未改动直接退出，不发请求
  if (!oldName || !next || oldName === next) return
  const result = await ctx.api.tag.rename(oldName, next)
  if (!result.ok) {
    toast(t('menu.error', { message: result.error.message }), 'error')
    return
  }
  // 勾选状态跟随迁移到新名，保持筛选结果连续，再刷新列表与结果
  const index = selected.value.indexOf(oldName)
  if (index >= 0) selected.value[index] = next
  await loadTags()
  await applyFilter()
}

// 确认删除：从所有笔记中移除该标签，成功后同步清掉勾选并刷新
async function deleteTag(): Promise<void> {
  const name = confirm.value.name
  confirm.value = { open: false, name: '' }
  const result = await ctx.api.tag.delete(name)
  if (!result.ok) {
    toast(t('menu.error', { message: result.error.message }), 'error')
    return
  }
  const index = selected.value.indexOf(name)
  if (index >= 0) selected.value.splice(index, 1)
  await loadTags()
  await applyFilter()
}

// 打开结果笔记，并记入最近打开列表（供快速切换排序使用）
function openNote(note: NoteSummary): void {
  ctx.workspace.openNote(note.id)
  void ctx.api.settings.addRecent(asNoteId(note.id))
}

const stops: (() => void)[] = []
onMounted(() => {
  void loadTags()
  // 索引更新（编辑笔记增删标签）后刷新计数；换 vault 则清空勾选重新加载
  stops.push(ctx.events.on('index:updated', () => void loadTags()))
  stops.push(
    ctx.events.on('vault:changed', () => {
      clear()
      void loadTags()
    })
  )
})
onBeforeUnmount(() => {
  for (const stop of stops) stop()
})
</script>

<template>
  <div class="tags-view">
    <div class="filter-header">
      <div v-if="selected.length >= 2" class="segmented">
        <button
          type="button"
          :class="{ active: mode === 'and' }"
          @click="changeMode('and')"
        >
          {{ t('tags.and') }}
        </button>
        <button
          type="button"
          :class="{ active: mode === 'or' }"
          @click="changeMode('or')"
        >
          {{ t('tags.or') }}
        </button>
      </div>
      <button v-if="selected.length > 0" class="clear" type="button" @click="clear">
        {{ t('tags.clear') }}
      </button>
    </div>

    <div class="tag-list">
      <div
        v-for="tag in tags"
        :key="tag.id"
        class="tag-row"
        :class="{ selected: selected.includes(tag.name) }"
        @click="toggle(tag.name)"
        @contextmenu="openMenu($event, tag.name)"
      >
        <span class="check" :class="{ on: selected.includes(tag.name) }">
          <Icon v-if="selected.includes(tag.name)" name="check" :size="12" />
        </span>
        <span class="hash">#</span>
        <input
          v-if="editing === tag.name"
          class="rename"
          :value="editingValue"
          @input="editingValue = ($event.target as HTMLInputElement).value"
          @keydown.enter.prevent="submitRename"
          @keydown.escape="editing = null"
          @blur="submitRename"
          @click.stop
        />
        <span v-else class="name">{{ tag.name }}</span>
        <span class="count">{{ tag.count }}</span>
      </div>
      <div v-if="tags.length === 0" class="empty">{{ t('tags.empty') }}</div>
    </div>

    <div v-if="selected.length > 0" class="results">
      <div class="results-title">{{ t('tags.results', { count: results.length }) }}</div>
      <button
        v-for="note in results"
        :key="note.id"
        class="result"
        type="button"
        @click="openNote(note)"
      >
        <span class="result-title">{{ note.title }}</span>
        <span class="result-path">{{ note.folderPath }}</span>
      </button>
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
      :title="t('tags.delete')"
      @close="confirm.open = false"
    >
      <p>{{ t('tags.deleteConfirm', { name: confirm.name }) }}</p>
      <template #footer>
        <BaseButton variant="ghost" @click="confirm.open = false">{{ t('menu.cancel') }}</BaseButton>
        <BaseButton variant="danger" @click="deleteTag">{{ t('tags.delete') }}</BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.tags-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.filter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  padding: 0 8px;
  flex: none;
}

.segmented {
  display: inline-flex;
  height: 28px;
  padding: 2px;
  gap: 2px;
  background: var(--bg-inset);
  border-radius: var(--radius-input);
}

.segmented button {
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: calc(var(--radius-input) - 2px);
  font-size: 12px;
  color: var(--text-secondary);
}

.segmented button.active {
  background: var(--bg-selected);
  color: var(--text-primary);
  font-weight: 500;
}

.clear {
  font-size: 12px;
  color: var(--accent);
  padding: 0 4px;
}

.tag-list {
  flex: none;
  max-height: 45%;
  overflow: auto;
  padding: 0 4px;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 6px;
  border-radius: var(--radius-input);
  cursor: pointer;
  font-size: var(--font-size-ui);
}

.tag-row:hover {
  background: var(--bg-hover);
}

.tag-row.selected {
  background: var(--bg-selected);
}

.check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  color: #fff;
  flex: none;
}

.check.on {
  background: var(--accent);
  border-color: var(--accent);
}

.hash {
  color: var(--text-tertiary);
  font-size: 12px;
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count {
  font-size: 12px;
  color: var(--text-tertiary);
}

.rename {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 4px;
  background: var(--bg-app);
  border: 1px solid var(--accent);
  border-radius: var(--radius-inline);
  outline: none;
  font-size: 13px;
}

.empty {
  padding: 16px 8px;
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
}

.results {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin-top: 12px;
  padding: 0 4px 8px;
}

.results-title {
  padding: 4px 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.result {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-height: 32px;
  padding: 4px 6px;
  border-radius: var(--radius-input);
  text-align: left;
}

.result:hover {
  background: var(--bg-hover);
}

.result-title {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-path {
  font-size: 12px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
