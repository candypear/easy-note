<script setup lang="ts">
import { computed, ref, watch, type PropType } from 'vue'
import type { Editor } from '@tiptap/core'
import { useContext } from '../../../app/providers'
import Icon from '../../../ui/icons/Icon.vue'
import BaseInput from '../../../ui/input/BaseInput.vue'

const props = defineProps({
  editor: { type: Object as PropType<Editor | null>, default: null },
  open: { type: Boolean, default: false }
})

const emit = defineEmits<{ close: [] }>()
const ctx = useContext()
const { t } = ctx.i18n
const query = ref('')
const replacement = ref('')
const active = ref(0)
const count = ref(0)

interface Match {
  from: number
  to: number
}

const hasQuery = computed(() => query.value.length > 0)

function findMatches(): Match[] {
  const editor = props.editor
  if (!editor || !query.value) return []
  const needle = query.value.toLowerCase()
  const matches: Match[] = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const haystack = node.text.toLowerCase()
    let index = haystack.indexOf(needle)
    while (index >= 0) {
      matches.push({ from: pos + index, to: pos + index + needle.length })
      index = haystack.indexOf(needle, index + needle.length)
    }
  })
  return matches
}

function selectMatch(forward: boolean): void {
  const editor = props.editor
  if (!editor) return
  const matches = findMatches()
  count.value = matches.length
  if (matches.length === 0) return
  const cursor = editor.state.selection.from
  let target = forward
    ? matches.find((match) => match.from >= cursor) ?? matches[0]
    : [...matches].reverse().find((match) => match.to <= cursor) ?? matches[matches.length - 1]
  if (!target) return
  editor.chain().focus().setTextSelection({ from: target.from, to: target.to }).scrollIntoView().run()
  active.value = matches.indexOf(target)
}

watch(
  () => [query.value, props.open] as const,
  () => {
    if (props.open) selectMatch(true)
  }
)

function replaceCurrent(): void {
  const editor = props.editor
  if (!editor || !query.value) return
  const { from, to } = editor.state.selection
  if (editor.state.doc.textBetween(from, to).toLowerCase() === query.value.toLowerCase()) {
    editor.chain().focus().insertContentAt({ from, to }, replacement.value).run()
  }
  selectMatch(true)
}

function replaceAll(): void {
  const editor = props.editor
  if (!editor || !query.value) return
  const matches = findMatches()
  if (matches.length === 0) return
  const chain = editor.chain().focus()
  for (const match of [...matches].reverse()) {
    chain.insertContentAt({ from: match.from, to: match.to }, replacement.value)
  }
  chain.run()
  count.value = 0
}

function close(): void {
  emit('close')
  props.editor?.commands.focus()
}
</script>

<template>
  <div v-if="props.open" class="find-bar no-drag">
    <BaseInput
      v-model="query"
      :placeholder="t('editor.find')"
      icon="search"
      size="sm"
      @enter="selectMatch(true)"
      @escape="close"
    />
    <span class="count">{{ hasQuery ? `${active + 1}/${count}` : '' }}</span>
    <button class="icon-button" type="button" :aria-label="t('editor.find')" @click="selectMatch(false)">
      <Icon name="chevronUp" :size="14" />
    </button>
    <button class="icon-button" type="button" :aria-label="t('editor.find')" @click="selectMatch(true)">
      <Icon name="chevronDown" :size="14" />
    </button>
    <BaseInput v-model="replacement" :placeholder="t('editor.replace')" size="sm" @enter="replaceCurrent" />
    <button class="text-button" type="button" @click="replaceCurrent">{{ t('editor.replace') }}</button>
    <button class="text-button" type="button" @click="replaceAll">{{ t('editor.replaceAll') }}</button>
    <button class="icon-button" type="button" :aria-label="t('editor.closeFind')" @click="close">
      <Icon name="close" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.find-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-app);
  border-bottom: 1px solid var(--border);
  flex: none;
}

.find-bar > :first-child {
  width: 200px;
}

.count {
  min-width: 42px;
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 3px;
  color: var(--text-secondary);
}

.icon-button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.text-button {
  font-size: 12px;
  color: var(--accent);
  padding: 0 4px;
}

.text-button:hover {
  text-decoration: underline;
}
</style>
