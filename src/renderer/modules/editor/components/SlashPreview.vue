<script setup lang="ts">
// 斜杠菜单右侧的块类型预览：先逐字"打字"展示 Markdown 源码，
// 停顿后淡入对应的静态渲染效果，帮助用户理解插入结果。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { renderKatex } from '../extensions/math/katex'

type PreviewKind =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'quote'
  | 'code'
  | 'math'
  | 'table'
  | 'divider'

interface PreviewDefinition {
  markdown: string
  kind: PreviewKind
}

// 各菜单项的示例 Markdown 与对应渲染类型（渲染结果为模板中的静态片段，不走真实解析器）
const PREVIEWS: Record<string, PreviewDefinition> = {
  paragraph: { kind: 'paragraph', markdown: '这是一段正文。' },
  h1: { kind: 'h1', markdown: '# 标题一' },
  h2: { kind: 'h2', markdown: '## 标题二' },
  h3: { kind: 'h3', markdown: '### 标题三' },
  bullet: { kind: 'bullet', markdown: '- 列表项 A\n- 列表项 B' },
  ordered: { kind: 'ordered', markdown: '1. 第一项\n2. 第二项' },
  task: { kind: 'task', markdown: '- [ ] 待办事项\n- [x] 已完成事项' },
  quote: { kind: 'quote', markdown: '> 引用内容' },
  code: { kind: 'code', markdown: '```js\nconst answer = 42\n```' },
  math: { kind: 'math', markdown: '$$\nE = mc^2\n$$' },
  table: { kind: 'table', markdown: '| 名称 | 数量 |\n| --- | --- |\n| 苹果 | 3 |' },
  divider: { kind: 'divider', markdown: '---' }
}

const props = defineProps<{
  itemId: string
  label: string
  left: number
  top: number
}>()

const FALLBACK: PreviewDefinition = { kind: 'paragraph', markdown: '这是一段正文。' }
const TYPE_INTERVAL_MS = 45
const REVEAL_DELAY_MS = 700
const definition = computed<PreviewDefinition>(() => PREVIEWS[props.itemId] ?? FALLBACK)
const phase = ref<'typing' | 'rendered'>('typing')
const typed = ref('')
const mathHtml = computed(() => renderKatex('E = mc^2', true).html)

let typeTimer: ReturnType<typeof setInterval> | null = null
let revealTimer: ReturnType<typeof setTimeout> | null = null

function stopTimers(): void {
  if (typeTimer) {
    clearInterval(typeTimer)
    typeTimer = null
  }
  if (revealTimer) {
    clearTimeout(revealTimer)
    revealTimer = null
  }
}

// 打字动画：按码点逐字追加（Array.from 保证中文/emoji 不被截半），
// 打完后延时切换到 rendered 阶段；重启前先清掉旧定时器防止叠加。
function start(): void {
  stopTimers()
  typed.value = ''
  phase.value = 'typing'
  const chars = Array.from(definition.value.markdown)
  if (chars.length === 0) {
    phase.value = 'rendered'
    return
  }
  let index = 0
  typeTimer = setInterval(() => {
    typed.value += chars[index]
    index += 1
    if (index < chars.length) return
    if (typeTimer) {
      clearInterval(typeTimer)
      typeTimer = null
    }
    revealTimer = setTimeout(() => {
      phase.value = 'rendered'
      revealTimer = null
    }, REVEAL_DELAY_MS)
  }, TYPE_INTERVAL_MS)
}

watch(() => props.itemId, start, { immediate: true })

onBeforeUnmount(stopTimers)
</script>

<template>
  <div
    class="slash-preview no-drag"
    :style="{ left: `${props.left}px`, top: `${props.top}px` }"
    aria-hidden="true"
  >
    <div class="preview-head">
      <span class="preview-title">{{ props.label }}</span>
      <span class="preview-phase">{{ phase === 'typing' ? 'Markdown' : '预览' }}</span>
    </div>
    <div class="preview-body">
      <Transition name="preview-fade" mode="out-in">
        <div v-if="phase === 'typing'" key="typing" class="preview-source">
          <pre>{{ typed }}<span class="preview-caret" /></pre>
        </div>
        <div v-else key="rendered" class="preview-render">
          <p v-if="definition.kind === 'paragraph'">这是一段正文。</p>
          <h1 v-else-if="definition.kind === 'h1'">标题一</h1>
          <h2 v-else-if="definition.kind === 'h2'">标题二</h2>
          <h3 v-else-if="definition.kind === 'h3'">标题三</h3>
          <ul v-else-if="definition.kind === 'bullet'">
            <li>列表项 A</li>
            <li>列表项 B</li>
          </ul>
          <ol v-else-if="definition.kind === 'ordered'">
            <li>第一项</li>
            <li>第二项</li>
          </ol>
          <ul v-else-if="definition.kind === 'task'" class="preview-task-list">
            <li><input type="checkbox" disabled /> 待办事项</li>
            <li><input type="checkbox" checked disabled /> 已完成事项</li>
          </ul>
          <blockquote v-else-if="definition.kind === 'quote'">引用内容</blockquote>
          <pre v-else-if="definition.kind === 'code'"><code>const answer = 42</code></pre>
          <div v-else-if="definition.kind === 'math'" class="preview-math" v-html="mathHtml" />
          <table v-else-if="definition.kind === 'table'">
            <thead>
              <tr>
                <th>名称</th>
                <th>数量</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>苹果</td>
                <td>3</td>
              </tr>
            </tbody>
          </table>
          <div v-else-if="definition.kind === 'divider'" class="preview-divider">
            <hr />
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.slash-preview {
  position: fixed;
  z-index: 56;
  box-sizing: border-box;
  width: 248px;
  height: 170px;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-menu);
  box-shadow: var(--shadow-menu);
  pointer-events: none;
}

.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 11px;
  line-height: 1.2;
  color: var(--text-tertiary);
}

.preview-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-phase {
  flex: none;
  font-family: var(--font-mono);
  font-size: 11px;
}

.preview-body {
  height: 128px;
  overflow: hidden;
}

.preview-source,
.preview-render {
  height: 100%;
}

.preview-source pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.preview-caret {
  display: inline-block;
  width: 2px;
  height: 13px;
  margin-left: 1px;
  vertical-align: -2px;
  background: var(--accent);
  animation: preview-caret 1.2s steps(1) infinite;
}

@keyframes preview-caret {
  0%,
  50% {
    opacity: 1;
  }

  50.01%,
  100% {
    opacity: 0;
  }
}

.preview-render {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}

.preview-render p {
  margin: 0;
}

.preview-render h1,
.preview-render h2,
.preview-render h3 {
  margin: 0;
  font-weight: 600;
  line-height: 1.3;
}

.preview-render h1 {
  font-size: 20px;
}

.preview-render h2 {
  font-size: 16px;
}

.preview-render h3 {
  font-size: 14px;
}

.preview-render ul,
.preview-render ol {
  margin: 0;
  padding-left: 20px;
}

.preview-render li {
  margin: 1px 0;
}

.preview-render blockquote {
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid var(--border-strong);
  color: var(--text-secondary);
}

.preview-render pre {
  margin: 0;
  padding: 8px;
  background: var(--bg-inset);
  border-radius: var(--radius-inline);
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
}

.preview-render code {
  font-family: var(--font-mono);
}

.preview-render table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.preview-render th,
.preview-render td {
  padding: 3px 6px;
  border: 1px solid var(--border);
  text-align: left;
}

.preview-render th {
  background: var(--bg-inset);
  font-weight: 500;
}

.preview-task-list {
  padding-left: 0;
  list-style: none;
}

.preview-task-list li {
  display: flex;
  align-items: center;
  gap: 6px;
}

.preview-task-list input {
  width: 12px;
  height: 12px;
  margin: 0;
  accent-color: var(--accent);
}

.preview-math {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.preview-divider {
  display: flex;
  align-items: center;
  height: 100%;
}

.preview-divider hr {
  width: 100%;
  margin: 0;
  border: 0;
  border-top: 1px solid var(--border);
}

.preview-fade-enter-active,
.preview-fade-leave-active {
  transition:
    opacity 280ms ease,
    transform 280ms ease;
}

.preview-fade-enter-from {
  opacity: 0;
  transform: translateY(3px) scale(0.98);
}

.preview-fade-leave-to {
  opacity: 0;
  transform: translateY(-3px) scale(0.98);
}
</style>
