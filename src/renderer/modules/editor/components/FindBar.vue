<script setup lang="ts">
// 查找替换栏：在 ProseMirror 文档中做大小写不敏感的文本查找，
// 通过选区定位匹配项并支持逐个/全部替换。
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

// 遍历所有文本节点收集匹配区间；pos 是节点起点，加上节点内偏移得到文档坐标。
// 匹配不跨节点，因此跨越格式边界（如一半加粗）的关键词不会被找到。
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

// 以当前光标位置为基准找下一个/上一个匹配：向前取第一个 from >= 光标，
// 向后取最后一个 to <= 光标（即整个匹配在光标之前）；越界时循环到另一端。
// 命中后把匹配设为选区并滚动到可见，供“替换当前”直接使用该选区。
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

// 查询词或打开状态变化时自动定位第一个匹配
watch(
  () => [query.value, props.open] as const,
  () => {
    if (props.open) selectMatch(true)
  }
)

// 替换当前选区：先校验选区文本确实等于查询词（用户可能手动改过选区），
// 避免误替换；替换后自动跳到下一个匹配。
function replaceCurrent(): void {
  const editor = props.editor
  if (!editor || !query.value) return
  const { from, to } = editor.state.selection
  if (editor.state.doc.textBetween(from, to).toLowerCase() === query.value.toLowerCase()) {
    editor.chain().focus().insertContentAt({ from, to }, replacement.value).run()
  }
  selectMatch(true)
}

// 全部替换：倒序应用各匹配区间，前面的替换不会使后面匹配的位置失效；
// 整个链式调用在一个事务内完成，可一次撤销。
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

// 关闭后把焦点还给编辑器，方便继续编辑
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
  border-radius: var(--radius-inline);
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
