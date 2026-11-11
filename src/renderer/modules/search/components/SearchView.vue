<script setup lang="ts">
// 全文搜索视图：输入防抖后调用主进程搜索接口，展示标题/摘录/路径，
// 点击结果跳转到命中块；摘录文本由主进程生成，渲染层按纯文本展示。
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
// searched 区分"还没搜过"与"搜过但无结果"，控制空态文案
const searched = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
// 递增的请求序号：只采纳最新一次请求的结果，丢弃过期响应
let requestId = 0
let inputRef: InstanceType<typeof BaseInput> | null = null

async function run(value: string): Promise<void> {
  const trimmed = value.trim()
  // 空白查询直接复位，不发请求
  if (!trimmed) {
    results.value = []
    searched.value = false
    loading.value = false
    return
  }
  const id = ++requestId
  loading.value = true
  const result = await ctx.api.search.search(trimmed)
  // 等待期间用户又输入了新查询：本次响应已过期，直接丢弃防止旧结果覆盖新结果
  if (id !== requestId) return
  loading.value = false
  searched.value = true
  results.value = result.ok ? result.data : []
}

// 150ms 防抖：连续输入只在停顿后搜索一次；立即置 loading 给出即时反馈
watch(query, (value) => {
  if (timer) clearTimeout(timer)
  loading.value = value.trim().length > 0
  timer = setTimeout(() => void run(value), 150)
})

// 打开命中笔记：有 blockId 时定位到命中块（仅标题命中时为 null），并记入最近打开
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
  // 监听模块入口（Ctrl+Shift+F）广播的聚焦事件；换 vault 后清空旧库的查询与结果
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
  // 清理未触发的防抖定时器，避免卸载后仍发起搜索
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
