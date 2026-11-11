<script setup lang="ts">
import { NodeViewWrapper } from '@tiptap/vue-3'
import { computed, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue'
import Icon from '../../../../ui/icons/Icon.vue'
import { toast } from '../../../../ui'
import { LANGUAGES } from './languages'
import { createCodeEditor, type CodeEditorHandle } from './codemirror-adapter'

interface NodeViewLike {
  node: { attrs: Record<string, unknown> }
  updateAttributes: (attrs: Record<string, unknown>) => void
  selected: boolean
}

const props = defineProps({
  node: { type: Object as PropType<NodeViewLike['node']>, required: true },
  updateAttributes: {
    type: Function as PropType<NodeViewLike['updateAttributes']>,
    required: true
  },
  selected: { type: Boolean, default: false }
})
const host = ref<HTMLElement | null>(null)
const editor = ref<CodeEditorHandle | null>(null)

const code = computed(() => String(props.node.attrs.code ?? ''))
const language = computed(() => (props.node.attrs.language ? String(props.node.attrs.language) : 'plaintext'))
const collapsed = computed(() => Boolean(props.node.attrs.collapsed))
const lines = computed(() => code.value.split('\n').length)
const preview = computed(() => code.value.split('\n')[0] ?? '')

const languageOptions = LANGUAGES

onMounted(() => {
  if (!host.value) return
  editor.value = createCodeEditor(host.value, {
    value: code.value,
    language: language.value,
    onChange(value) {
      props.updateAttributes({ code: value })
    }
  })
})

watch(code, (value) => {
  editor.value?.setValue(value)
})

watch(collapsed, (value) => {
  if (value || !host.value || editor.value) return
  editor.value = createCodeEditor(host.value, {
    value: code.value,
    language: language.value,
    onChange(next) {
      props.updateAttributes({ code: next })
    }
  })
})

function changeLanguage(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  props.updateAttributes({ language: value })
  editor.value?.setLanguage(value)
}

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(code.value)
    toast('已复制')
  } catch {
    toast('复制失败', 'error')
  }
}

function toggleFold(): void {
  props.updateAttributes({ collapsed: !collapsed.value })
  if (!collapsed.value && !editor.value) {
    requestAnimationFrame(() => {
      if (!host.value) return
      editor.value = createCodeEditor(host.value, {
        value: code.value,
        language: language.value,
        onChange(next) {
          props.updateAttributes({ code: next })
        }
      })
    })
  }
}

onBeforeUnmount(() => {
  editor.value?.destroy()
  editor.value = null
})
</script>

<template>
  <NodeViewWrapper as="div" class="code-block" :class="{ selected: props.selected }">
    <div class="code-header">
      <select class="language" :value="language" @change="changeLanguage">
        <option v-for="option in languageOptions" :key="option.id" :value="option.id">
          {{ option.label }}
        </option>
      </select>
      <div class="actions">
        <button class="icon-button" type="button" aria-label="复制" @click="copy">
          <Icon name="copy" :size="14" />
        </button>
        <button class="icon-button" type="button" aria-label="折叠" @click="toggleFold">
          <Icon :name="collapsed ? 'chevronDown' : 'chevronUp'" :size="14" />
        </button>
      </div>
    </div>
    <div v-show="!collapsed" ref="host" class="code-host" />
    <div v-if="collapsed" class="code-collapsed" @click="toggleFold">
      <code>{{ preview }}</code>
      <span>共 {{ lines }} 行</span>
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.code-block {
  margin: 8px 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-menu);
  overflow: hidden;
}

.code-block.selected {
  outline: 2px solid var(--focus-ring);
}

.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 0 4px 0 8px;
  border-bottom: 1px solid var(--border);
}

.language {
  height: 24px;
  padding: 0 4px;
  background: transparent;
  border: 0;
  border-radius: var(--radius-inline);
  font-size: 12px;
  color: var(--text-secondary);
  outline: none;
}

.language:hover {
  background: var(--bg-hover);
}

.actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-inline);
  color: var(--text-tertiary);
}

.icon-button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.code-host {
  height: auto;
  max-height: 420px;
}

.code-host :deep(.cm-editor) {
  max-height: 420px;
}

.code-collapsed {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 24px;
  padding: 0 12px;
  font-size: 12px;
  color: var(--text-tertiary);
  cursor: pointer;
}

.code-collapsed code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
}
</style>
