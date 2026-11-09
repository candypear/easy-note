<script setup lang="ts">
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

async function convert(mention: UnlinkedMentionDTO): Promise<void> {
  if (!noteId.value) return
  const result = await ctx.api.link.convertMention({
    sourceNoteId: mention.sourceNoteId,
    sourceBlockId: mention.sourceBlockId,
    targetTitle: ctx.workspace.currentNoteTitle
  })
  if (result.ok) await load()
}

async function convertAll(): Promise<void> {
  if (!noteId.value) return
  const result = await ctx.api.link.convertAll(asNoteId(noteId.value))
  if (result.ok) await load()
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(`[[${ctx.workspace.currentNoteTitle}]]`)
    toast(t('editor.copied'))
  } catch {
    toast(t('editor.copied'), 'error')
  }
}

watch(noteId, () => void load(), { immediate: true })

const stops: (() => void)[] = []
onMounted(() => {
  stops.push(ctx.events.on('index:updated', () => void load()))
  stops.push(ctx.events.on('note:renamed', () => void load()))
})
onBeforeUnmount(() => {
  for (const stop of stops) stop()
})
</script>

<template>
  <div class="backlinks">
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

    <template v-if="unlinked.length > 0">
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
    </template>

    <div v-if="loading" class="loading">{{ t('shell.loading') }}</div>
  </div>
</template>

<style scoped>
.backlinks {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.group-title {
  margin: 12px 0 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.group-title:first-child {
  margin-top: 0;
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
  font-size: 13.5px;
}

.badge {
  padding: 0 4px;
  background: var(--bg-sidebar);
  border-radius: 3px;
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
