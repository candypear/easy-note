<script setup lang="ts">
// 反链面板：展示当前笔记的"已链接引用"与"未链接提及"（数据来自主进程链接索引），
// 支持点击跳转来源笔记、把提及一键转成 [[链接]]、复制当前笔记的链接写法。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { BacklinkDTO, UnlinkedMentionDTO } from '@shared/contracts/link'
import { asNoteId } from '@shared/types/brand'
import { useContext } from '../../../app/providers'
import BaseButton from '../../../ui/button/BaseButton.vue'
import { toast } from '../../../ui'

const ctx = useContext()
const { t } = ctx.i18n
const noteId = computed(() => ctx.workspace.currentNoteId)
const linked = ref<BacklinkDTO[]>([])
const unlinked = ref<UnlinkedMentionDTO[]>([])
const loading = ref(false)

// 并行拉取两类数据；无当前笔记时清空面板
async function load(): Promise<void> {
  if (!noteId.value) {
    linked.value = []
    unlinked.value = []
    return
  }
  loading.value = true
  const [links, mentions] = await Promise.all([
    ctx.api.link.backlinks(asNoteId(noteId.value)),
    ctx.api.link.unlinked(asNoteId(noteId.value))
  ])
  loading.value = false
  linked.value = links.ok ? links.data : []
  unlinked.value = mentions.ok ? mentions.data : []
}

function openSource(sourceNoteId: string): void {
  ctx.workspace.openNote(sourceNoteId)
}

// 把单条未链接提及改写为 [[当前笔记标题]]（主进程按块+出现序号精确定位），成功后刷新
async function convert(mention: UnlinkedMentionDTO): Promise<void> {
  if (!noteId.value) return
  const result = await ctx.api.link.convertMention({
    sourceNoteId: mention.sourceNoteId,
    sourceBlockId: mention.sourceBlockId,
    targetTitle: ctx.workspace.currentNoteTitle
  })
  if (result.ok) await load()
}

// 批量把全库指向当前笔记的提及全部转为链接
async function convertAll(): Promise<void> {
  if (!noteId.value) return
  const result = await ctx.api.link.convertAll(asNoteId(noteId.value))
  if (result.ok) await load()
}

// 空态辅助：复制 [[标题]] 到剪贴板，方便到其他笔记里粘贴建立引用
async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(`[[${ctx.workspace.currentNoteTitle}]]`)
    toast(t('editor.copied'))
  } catch {
    toast(t('editor.copied'), 'error')
  }
}

// 切换笔记立即重载（immediate 保证面板首次渲染就有数据）
watch(noteId, () => void load(), { immediate: true })

const stops: (() => void)[] = []
onMounted(() => {
  // 索引更新（任何笔记编辑都可能增删引用/提及）或笔记重命名（影响标题匹配）后刷新
  stops.push(ctx.events.on('index:updated', () => void load()))
  stops.push(ctx.events.on('note:renamed', () => void load()))
})
onBeforeUnmount(() => {
  for (const stop of stops) stop()
})
</script>

<template>
  <div class="backlinks">
    <div class="grp">
      <div class="group-title">{{ t('backlinks.linked') }}</div>
      <div v-if="linked.length === 0" class="empty">
        <p>{{ t('backlinks.empty') }}</p>
        <BaseButton variant="ghost" size="sm" @click="copyLink">
          {{ t('backlinks.copyLink') }}
        </BaseButton>
      </div>
      <button
        v-for="item in linked"
        :key="`${item.sourceNoteId}-${item.sourceBlockId ?? ''}`"
        class="entry"
        type="button"
        @click="openSource(item.sourceNoteId)"
      >
        <div class="entry-title">
          <span>{{ item.sourceNoteTitle }}</span>
          <span v-if="item.blockRef" class="badge">{{ t('backlinks.block') }}</span>
        </div>
        <div class="context">{{ item.context }}</div>
      </button>
    </div>

    <div v-if="unlinked.length > 0" class="grp">
      <div class="group-title with-action">
        <span>{{ t('backlinks.unlinked') }}</span>
        <button type="button" class="text-button" @click="convertAll">
          {{ t('backlinks.convertAll') }}
        </button>
      </div>
      <button
        v-for="item in unlinked"
        :key="`${item.sourceNoteId}-${item.sourceBlockId}-${item.occurrence}`"
        class="entry"
        type="button"
        @click="openSource(item.sourceNoteId)"
      >
        <div class="entry-title">
          <span>{{ item.sourceNoteTitle }}</span>
        </div>
        <div class="context">{{ item.context }}</div>
        <span class="convert" @click.stop="convert(item)">{{ t('backlinks.convert') }}</span>
      </button>
    </div>

    <div v-if="loading" class="loading">{{ t('shell.loading') }}</div>
  </div>
</template>

<style scoped>
.backlinks {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.grp {
  padding: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-menu);
}

.group-title {
  margin: 0 0 6px;
  padding: 2px 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.text-button {
  font-size: 12px;
  color: var(--accent);
}

.text-button:hover {
  text-decoration: underline;
}

.entry {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 32px;
  padding: 4px 6px;
  border-radius: var(--radius-input);
  text-align: left;
}

.entry:hover {
  background: var(--bg-hover);
}

.entry-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-ui);
}

.badge {
  padding: 0 4px;
  background: var(--bg-inset);
  border-radius: var(--radius-inline);
  font-size: 11px;
  color: var(--text-tertiary);
}

.context {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.convert {
  display: none;
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: var(--accent);
}

.entry:hover .convert {
  display: inline;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 6px;
  color: var(--text-secondary);
  font-size: 13px;
}

.empty p {
  margin: 0;
}

.loading {
  padding: 8px 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
