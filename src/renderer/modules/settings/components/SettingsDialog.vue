<script setup lang="ts">
// 设置对话框：vault 切换、主题/字号（先改 UI 即时生效再异步持久化）、
// 快捷键速查、重建索引与版本信息。
import { onMounted, ref } from 'vue'
import type { SettingsDTO, ThemeMode, FontSize } from '@shared/contracts/settings'
import { formatRelativeTime } from '@shared/utils/date'
import { useContext } from '../../../app/providers'
import BaseButton from '../../../ui/button/BaseButton.vue'
import BaseDialog from '../../../ui/dialog/BaseDialog.vue'
import Icon from '../../../ui/icons/Icon.vue'

const ctx = useContext()
const { t } = ctx.i18n
const settings = ref<SettingsDTO | null>(null)
// 构建时注入的应用版本号
const appVersion = __APP_VERSION__
const showShortcuts = ref(false)
const rebuilding = ref(false)

// 快捷键速查表（仅展示用）：组合键 → 说明文案的 i18n key
const shortcuts: [string, string][] = [
  ['Ctrl+N', 'settings.shortcut.newNote'],
  ['Ctrl+K', 'settings.shortcut.quickSwitch'],
  ['Ctrl+Shift+F', 'settings.shortcut.search'],
  ['Ctrl+F', 'settings.shortcut.find'],
  ['Ctrl+E', 'settings.shortcut.source'],
  ['Ctrl+S', 'settings.shortcut.save'],
  ['F2', 'settings.shortcut.rename'],
  ['Esc', 'settings.shortcut.escape']
]

onMounted(async () => {
  const result = await ctx.api.settings.get()
  if (result.ok) settings.value = result.data
})

function close(): void {
  ctx.shell.closeOverlay()
}

// 增量持久化设置：以主进程返回的完整 DTO 覆盖本地，保证与磁盘上的真实值一致
async function apply(patch: Partial<SettingsDTO>): Promise<void> {
  const result = await ctx.api.settings.set(patch)
  if (result.ok) settings.value = result.data
}

// 先更新 shell 响应式状态让主题立即切换，再异步写盘，避免 UI 等待 IPC 往返
function setTheme(theme: ThemeMode): void {
  ctx.shell.setThemeMode(theme)
  void apply({ theme })
}

// 同主题：字号先作用于 shell 状态即时生效，再持久化
function setFontSize(fontSize: FontSize): void {
  ctx.shell.state.fontSize = fontSize
  void apply({ fontSize })
}

// 换库流程：系统目录选择框 → 打开新 vault → 关闭旧笔记（旧库笔记在新库中无效）
async function changeVault(): Promise<void> {
  const picked = await ctx.api.vault.pickFolder()
  // 用户取消选择时 pickFolder 返回空，直接结束
  if (!picked.ok || !picked.data) return
  const result = await ctx.api.vault.open(picked.data)
  if (result.ok) {
    ctx.workspace.closeNote()
    settings.value = settings.value ? { ...settings.value, vaultPath: result.data.path } : null
  }
}

// 全量重建索引：rebuilding 防重入，完成后重新拉取设置以刷新"上次索引时间"
async function rebuild(): Promise<void> {
  if (rebuilding.value) return
  rebuilding.value = true
  await ctx.api.settings.rebuildIndex()
  rebuilding.value = false
  const result = await ctx.api.settings.get()
  if (result.ok) settings.value = result.data
}
</script>

<template>
  <BaseDialog :open="true" :title="t('settings.title')" :width="560" @close="close">
    <div class="section">
      <div class="section-title">{{ t('settings.vault') }}</div>
      <div class="row">
        <span class="path">{{ settings?.vaultPath ?? '—' }}</span>
        <BaseButton variant="secondary" size="sm" @click="changeVault">
          {{ t('settings.changeVault') }}
        </BaseButton>
      </div>
      <p class="hint">{{ t('settings.vaultHint') }}</p>
    </div>

    <div class="section">
      <div class="section-title">{{ t('settings.appearance') }}</div>
      <div class="row">
        <span>{{ t('settings.theme') }}</span>
        <div class="segmented">
          <button type="button" :class="{ active: settings?.theme === 'light' }" @click="setTheme('light')">
            {{ t('settings.theme.light') }}
          </button>
          <button type="button" :class="{ active: settings?.theme === 'dark' }" @click="setTheme('dark')">
            {{ t('settings.theme.dark') }}
          </button>
          <button type="button" :class="{ active: settings?.theme === 'system' }" @click="setTheme('system')">
            {{ t('settings.theme.system') }}
          </button>
        </div>
      </div>
      <div class="row">
        <span>{{ t('settings.fontSize') }}</span>
        <div class="segmented">
          <button
            v-for="size in ([14, 16, 18] as const)"
            :key="size"
            type="button"
            :class="{ active: settings?.fontSize === size }"
            @click="setFontSize(size)"
          >
            {{ size }}
          </button>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">{{ t('settings.shortcuts') }}</div>
      <button class="row expandable" type="button" @click="showShortcuts = !showShortcuts">
        <span>{{ t('settings.viewShortcuts') }}</span>
        <Icon :name="showShortcuts ? 'chevronDown' : 'chevronRight'" :size="16" />
      </button>
      <table v-if="showShortcuts" class="shortcut-table">
        <tbody>
          <tr v-for="[combo, key] in shortcuts" :key="combo">
            <td class="combo">{{ combo }}</td>
            <td>{{ t(key) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">{{ t('settings.index') }}</div>
      <div class="row">
        <span class="hint inline">
          {{
            settings?.lastIndexedAt
              ? t('settings.lastIndexed', { time: formatRelativeTime(settings.lastIndexedAt) })
              : t('settings.neverIndexed')
          }}
        </span>
        <BaseButton variant="secondary" size="sm" :disabled="rebuilding" @click="rebuild">
          {{ t('settings.rebuild') }}
        </BaseButton>
      </div>
    </div>

    <div class="section">
      <div class="section-title">{{ t('settings.about') }}</div>
      <div class="row">
        <span>{{ t('settings.version', { version: appVersion }) }}</span>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="ghost" @click="close">{{ t('settings.close') }}</BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.section {
  margin-bottom: 24px;
}

.section:last-child {
  margin-bottom: 0;
}

.section-title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
  font-size: 13px;
}

.path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
}

.hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

.hint.inline {
  margin: 0;
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

.expandable {
  width: 100%;
  border-radius: var(--radius-input);
  padding: 0 4px;
}

.expandable:hover {
  background: var(--bg-hover);
}

.shortcut-table {
  width: 100%;
  margin-top: 8px;
  border-collapse: collapse;
  font-size: 12px;
}

.shortcut-table td {
  padding: 4px 4px;
  color: var(--text-secondary);
}

.combo {
  width: 120px;
  color: var(--text-primary);
  font-family: var(--font-mono);
}
</style>
