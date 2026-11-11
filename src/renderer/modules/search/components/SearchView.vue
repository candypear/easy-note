<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SearchHit } from '@shared/contracts/search'
import { asNoteId } from '@shared/types/brand'
import { useContext } from '../../../app/providers'
import BaseInput from '../../../ui/input/BaseInput.vue'
import Icon from '../../../ui/icons/Icon.vue'

const ctx = useContext()
const { t } = ctx.i18n
const query = ref('')
const results = ref<SearchHit[]>([])
const loading = ref(false)
const searched = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
let requestId = 0
let inputRef: InstanceType<typeof BaseInput> | null = null

async function run(value: string): Promise<void> {
  const trimmed = value.trim()
  if (!trimmed) {
    results.value = []
    searched.value = false
    loading.value = false
    return
  }
  const id = ++requestId
  loading.value = true
  const result = await ctx.api.search.search(trimmed)
  if (id !== requestId) return
  loading.value = false
  searched.value = true
  results.value = result.ok ? result.data : []
}

watch(query, (value) => {
  if (timer) clearTimeout(timer)
  loading.value = value.trim().length > 0
  timer = setTimeout(() => void run(value), 150)
})

function open(hit: SearchHit): void {
  ctx.workspace.openNote(hit.noteId, hit.blockId ? { blockId: hit.blockId } : undefined)
  void ctx.api.settings.addRecent(asNoteId(hit.noteId))
}

function clear(): void {
  query.value = ''
  results.value = []
  searched.value = false
}

function focusInput(): void {
  inputRef?.focus()
}

defineExpose({ focusInput })

const stops: (() => void)[] = []
onMounted(() => {
  window.addEventListener('easynote:focus-search', focusInput)
  stops.push(
    ctx.events.on('vault:changed', () => {
      clear()
    })
  )
})
onBeforeUnmount(() => {
  for (const stop of stops) stop()
  window.removeEventListener('easynote:focus-search', focusInput)
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="search-view">
    <div class="search-box">
      <BaseInput
        ref="inputRef"
        v-model="query"
        :placeholder="t('search.placeholder')"
        icon="search"
        clearable
        size="sm"
      />
      <Icon v-if="loading" name="search" :size="14" class="spin loading" />
    </div>

    <div v-if="!query.trim()" class="hint">{{ t('search.empty') }}</div>
    <div v-else-if="searched && results.length === 0 && !loading" class="hint">
      <p>{{ t('search.noResult', { query }) }}</p>
      <button type="button" class="clear-link" @click="clear">{{ t('search.clear') }}</button>
    </div>
    <div v-else class="results">
      <button
        v-for="hit in results"
        :key="hit.noteId"
        class="result"
        type="button"
        @click="open(hit)"
      >
        <span class="title">{{ hit.title }}</span>
        <span class="snippet">{{ hit.snippet }}</span>
        <span class="path">{{ hit.path }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.search-box {
  position: relative;
  padding: 4px;
  flex: none;
}

.loading {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
}

.hint {
  padding: 24px 12px;
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
}

.hint p {
  margin: 0 0 8px;
}

.clear-link {
  font-size: 13px;
  color: var(--accent);
}

.clear-link:hover {
  text-decoration: underline;
}

.results {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px;
}

.result {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-height: 56px;
  padding: 6px;
  border-radius: var(--radius-input);
  text-align: left;
}

.result:hover {
  background: var(--bg-hover);
}

.title {
  font-size: var(--font-size-ui);
  font-weight: 400;
}

.snippet {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.path {
  font-size: 11px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
