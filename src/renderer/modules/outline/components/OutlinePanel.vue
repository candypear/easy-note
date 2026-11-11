<script setup lang="ts">
// 大纲面板：标题由编辑器遍历 ProseMirror 文档收集后写入 workspace.headings，本组件只做展示；
// 点击条目经 focusHeading 广播给编辑器定位滚动，空态按钮发"插入标题"信号（计数器）而非直接调用编辑器。
import { useContext } from '../../../app/providers'
import BaseButton from '../../../ui/button/BaseButton.vue'

const ctx = useContext()
const { t } = ctx.i18n
</script>

<template>
  <div class="outline">
    <button
      v-for="(heading, index) in ctx.workspace.headings"
      :key="`${heading.pos}-${index}`"
      class="item"
      :class="{ h1: heading.level === 1 }"
      :style="{ paddingLeft: `${8 + (heading.level - 1) * 12}px` }"
      type="button"
      @click="ctx.workspace.focusHeading(heading)"
    >
      {{ heading.text || t('app.untitled') }}
    </button>
    <div v-if="ctx.workspace.headings.length === 0 && ctx.workspace.currentNoteId" class="empty">
      <p>{{ t('outline.empty') }}</p>
      <BaseButton variant="ghost" size="sm" @click="ctx.workspace.requestInsertHeading()">
        {{ t('outline.addHeading') }}
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
.outline {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.item {
  height: 26px;
  padding-right: 8px;
  border-radius: var(--radius-input);
  font-size: 13px;
  color: var(--text-secondary);
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.item.h1 {
  font-weight: 500;
  color: var(--text-primary);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.empty p {
  margin: 0;
}
</style>
