<script setup lang="ts">
// 状态栏：左侧展示字数/字符/阅读时长，右侧展示索引进度与保存状态；
// 保存失败时提供"重试"，通过 workspace 计数器信号触发编辑器重新保存。
import { useContext } from '../../../app/providers'
import BaseButton from '../../../ui/button/BaseButton.vue'

const ctx = useContext()
const { t } = ctx.i18n
</script>

<template>
  <footer class="statusbar">
    <div class="stats">
      <span>{{ t('status.words', { count: ctx.workspace.wordCount }) }}</span>
      <span class="dot">·</span>
      <span>{{ t('status.chars', { count: ctx.workspace.charCount }) }}</span>
      <span class="dot">·</span>
      <span>{{ t('status.reading', { count: ctx.workspace.readingMinutes }) }}</span>
    </div>
    <div class="right">
      <span v-if="ctx.shell.state.indexProgress !== null" class="indexing">
        {{ t('status.indexing', { percent: Math.round(ctx.shell.state.indexProgress) }) }}
      </span>
      <span v-if="ctx.workspace.saveState === 'saved'" class="saved">{{ t('status.saved') }}</span>
      <span v-else-if="ctx.workspace.saveState === 'dirty'" class="dirty">{{ t('status.dirty') }}</span>
      <span v-else-if="ctx.workspace.saveState === 'saving'" class="dirty">{{ t('status.saving') }}</span>
      <span v-else class="error">
        <span class="error-dot" />
        {{ t('status.error') }}
        <BaseButton variant="text" size="sm" @click="ctx.workspace.requestSave()">
          {{ t('status.retry') }}
        </BaseButton>
      </span>
    </div>
  </footer>
</template>

<style scoped>
.statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--statusbar-height);
  padding: 0 12px;
  border-top: 1px solid var(--border);
  background: var(--bg-app);
  font-size: 12px;
  color: var(--text-tertiary);
  flex: none;
}

.stats {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  color: var(--border-strong);
}

.right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.saved {
  color: var(--success);
}

.dirty {
  color: var(--text-tertiary);
}

.error {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--danger);
}

.error-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--danger);
}

.indexing {
  color: var(--accent);
}
</style>
