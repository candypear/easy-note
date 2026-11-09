<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { QuickSwitchHit } from '@shared/contracts/search'
import { asNoteId } from '@shared/types/brand'
import { useContext } from '../../../app/providers'
import Icon from '../../../ui/icons/Icon.vue'

const ctx = useContext()
const { t } = ctx.i18n
const query = ref('')
const results = ref<QuickSwitchHit[]>([])
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

const recent = computed(() => results.value.filter((item) => item.recent))
const matches = computed(() => results.value.filter((item) => !item.recent))
const flat = computed(() => [...recent.value, ...matches.value])

async function load(value: string): Promise<void> {
  const result = await ctx.api.search.quickSwitch(value)
  if (result.ok) {
    results.value = result.data
    active.value = 0
  }
}

watch(query, (value) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void load(value), 100)
})

function close(): void {
  ctx.shell.closeOverlay()
}

function open(item: QuickSwitchHit | undefined): void {
  if (!item) return
  ctx.workspace.openNote(item.noteId)
  void ctx.api.settings.addRecent(asNoteId(item.noteId))
  close()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = (active.value + 1) % Math.max(flat.value.length, 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = (active.value - 1 + flat.value.length) % Math.max(flat.value.length, 1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    open(flat.value[active.value])
  }
}

onMounted(() => {
  void load('')
  input.value?.focus()
  document.addEventListener('keydown', onKeydown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="quick-switch-backdrop" @pointerdown.self="close">
    <div class="quick-switch" role="dialog" aria-modal="true">
      <div class="search-row">
        <Icon name="search" :size="16" />
        <input
          ref="input"
          v-model="query"
          :placeholder="t('quickSwitch.placeholder')"
          spellcheck="false"
        />
      </div>
      <div class="results">
        <div v-if="recent.length > 0" class="group">{{ t('quickSwitch.recent') }}</div>
        <button
          v-for="item in recent"
          :key="`recent-${item.noteId}`"
          class="result"
          :class="{ active: flat[active]?.noteId === item.noteId }"
          type="button"
          @mousedown.prevent="open(item)"
        >
          <span class="title">{{ item.title }}</span>
          <span class="path">{{ item.path }}</span>
        </button>
        <div v-if="matches.length > 0" class="group">{{ t('quickSwitch.match') }}</div>
        <button
          v-for="item in matches"
          :key="`match-${item.noteId}`"
          class="result"
          :class="{ active: flat[active]?.noteId === item.noteId }"
          type="button"
          @mousedown.prevent="open(item)"
        >
          <span class="title">{{ item.title }}</span>
          <span class="path">{{ item.path }}</span>
        </button>
        <div v-if="flat.length === 0" class="empty">{{ t('quickSwitch.noResult') }}</div>
      </div>
      <div class="hint">{{ t('quickSwitch.hint') }}</div>
    </div>
  </div>
</template>

<style scoped>
.quick-switch-backdrop {
  position: fixed;
  inset: 0;
  z-index: 75;
  background: var(--backdrop);
}

.quick-switch {
  position: absolute;
  top: 96px;
  left: 50%;
  transform: translateX(-50%);
  width: 520px;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-dialog);
  box-shadow: var(--shadow-menu);
  overflow: hidden;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text-tertiary);
}

.search-row input {
  flex: 1;
  background: transparent;
  border: 0;
  outline: none;
  font-size: 13px;
  color: var(--text-primary);
}

.results {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px;
}

.group {
  padding: 6px 8px 2px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.result {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  height: 36px;
  padding: 0 8px;
  border-radius: var(--radius-input);
  text-align: left;
}

.result:hover,
.result.active {
  background: var(--bg-hover);
}

.title {
  font-size: 13.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path {
  font-size: 11px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: none;
  max-width: 45%;
}

.empty {
  padding: 24px 8px;
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
}

.hint {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
