<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { EditorContent } from '@tiptap/vue-3'
import type { Editor } from '@tiptap/vue-3'
import type { Node as PMNode } from '@tiptap/pm/model'
import { asNoteId } from '@shared/types/brand'
import { useContext } from '../../../app/providers'
import BaseButton from '../../../ui/button/BaseButton.vue'
import BaseMenu, { type MenuItem } from '../../../ui/menu/BaseMenu.vue'
import Icon from '../../../ui/icons/Icon.vue'
import { toast } from '../../../ui'
import FindBar from './FindBar.vue'
import ExternalChangeBanner from './ExternalChangeBanner.vue'
import SourceMode from './SourceMode.vue'
import SlashMenu from './SlashMenu.vue'
import WikiLinkPopover from './WikiLinkPopover.vue'
import { collectHeadings, createEditor, documentStats } from '../composables/useEditor'
import { markdownToDocument } from '../extensions/markdown/parser'
import { documentToMarkdown } from '../extensions/markdown/serializer'
import '../styles/editor.css'

const ctx = useContext()
const { t } = ctx.i18n

const editor = shallowRef<Editor | null>(null)
const loading = ref(false)
const error = ref('')
const frontmatter = ref('')
const sourceValue = ref('')
const findOpen = ref(false)
const external = ref(false)

const slash = ref({ open: false, x: 0, y: 0, query: '', start: 0 })
const wiki = ref({
  open: false,
  x: 0,
  y: 0,
  query: '',
  range: null as { from: number; to: number } | null,
  mode: 'wiki' as 'wiki' | 'embed'
})
const handle = ref<{ top: number; left: number; pos: number } | null>(null)
const blockMenu = ref({ open: false, x: 0, y: 0, pos: 0 })

let currentId: string | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastSaved = ''
let applying = false

const isEmpty = computed(() => !ctx.workspace.currentNoteId)

function updateDerived(): void {
  const instance = editor.value
  if (!instance) return
  const json = instance.getJSON()
  ctx.workspace.setDocumentStats(documentStats(json))
  ctx.workspace.setHeadings(collectHeadings(instance.state.doc))
  ctx.workspace.setDocumentText(
    instance.state.doc.textBetween(0, instance.state.doc.content.size, '\n', '\n')
  )
}

function editorMarkdown(): string {
  const instance = editor.value
  if (!instance) return ''
  return documentToMarkdown(instance.getJSON(), frontmatter.value)
}

function currentMarkdown(): string {
  if (ctx.workspace.sourceMode) return sourceValue.value
  return editorMarkdown()
}

async function saveNow(): Promise<void> {
  if (!currentId) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const markdown = currentMarkdown()
  if (markdown === lastSaved) {
    ctx.workspace.setSaveState('saved')
    return
  }
  ctx.workspace.setSaveState('saving')
  const result = await ctx.api.note.save(asNoteId(currentId), markdown)
  if (result.ok) {
    lastSaved = markdown
    ctx.workspace.setSaveState('saved')
  } else {
    ctx.workspace.setSaveState('error')
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveNow(), 500)
}

function closeFlyouts(): void {
  slash.value.open = false
  wiki.value.open = false
}

function checkTriggers(): void {
  const instance = editor.value
  if (!instance || ctx.workspace.sourceMode) {
    closeFlyouts()
    return
  }
  const { $from } = instance.state.selection
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const slashMatch = before.match(/(?:^|\s)\/([\p{L}\p{N}]*)$/u)
  const wikiMatch = before.match(/(!?)\[\[([^\[\]]*)$/)

  if (slashMatch && !wikiMatch) {
    const query = slashMatch[1] ?? ''
    const index = before.lastIndexOf('/')
    const coords = instance.view.coordsAtPos(instance.state.selection.from)
    slash.value = {
      open: true,
      x: coords.left,
      y: coords.bottom + 6,
      query,
      start: $from.start() + index
    }
    wiki.value.open = false
  } else {
    slash.value.open = false
  }

  if (wikiMatch) {
    const coords = instance.view.coordsAtPos(instance.state.selection.from)
    wiki.value = {
      open: true,
      x: coords.left,
      y: coords.bottom + 6,
      query: wikiMatch[2] ?? '',
      range: { from: $from.start() + (wikiMatch.index ?? 0), to: $from.pos },
      mode: wikiMatch[1] === '!' ? 'embed' : 'wiki'
    }
    slash.value.open = false
  } else {
    wiki.value.open = false
  }
}

function onUpdate(): void {
  if (applying) return
  ctx.workspace.setSaveState('dirty')
  updateDerived()
  checkTriggers()
  scheduleSave()
}

function posAtOrdinal(doc: PMNode, ordinal: number): number | null {
  if (ordinal < 0 || ordinal >= doc.childCount) return null
  let pos = 0
  for (let index = 0; index < ordinal; index += 1) pos += doc.child(index).nodeSize
  return pos
}

function flashBlock(pos: number): void {
  const instance = editor.value
  if (!instance) return
  const node = instance.state.doc.nodeAt(pos)
  if (!node) return
  const dom = instance.view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return
  dom.classList.add('block-flash')
  setTimeout(() => dom.classList.remove('block-flash'), 1500)
}

async function applyReveal(): Promise<void> {
  const target = ctx.workspace.reveal
  const instance = editor.value
  if (!target || target.noteId !== currentId || !instance) return
  if (!target.blockId) {
    instance.commands.focus()
    return
  }
  const blocks = await ctx.api.block.listByNote(asNoteId(target.noteId))
  if (!blocks.ok) return
  const hit = blocks.data.find((block) => block.id === target.blockId)
  if (!hit) return
  const pos = posAtOrdinal(instance.state.doc, hit.ordinal)
  if (pos === null) return
  instance.chain().focus().setTextSelection(pos + 1).scrollIntoView().run()
  flashBlock(pos)
}

async function load(noteId: string | null): Promise<void> {
  if (currentId && currentId !== noteId && editor.value) {
    await saveNow()
  }
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (editor.value) {
    editor.value.destroy()
    editor.value = null
  }
  currentId = noteId
  closeFlyouts()
  error.value = ''
  external.value = false
  if (!noteId) {
    ctx.workspace.setDocumentStats({ words: 0, characters: 0, readingMinutes: 0 })
    ctx.workspace.setHeadings([])
    return
  }
  loading.value = true
  const result = await ctx.api.note.read(asNoteId(noteId))
  if (!result.ok) {
    loading.value = false
    error.value = result.error.message
    return
  }
  const parsed = markdownToDocument(result.data.content)
  frontmatter.value = parsed.frontmatter
  sourceValue.value = result.data.content
  lastSaved = result.data.content
  ctx.workspace.currentNoteTitle = result.data.title
  ctx.workspace.currentNotePath = result.data.path
  await nextTick()
  applying = true
  editor.value = createEditor({
    content: parsed.doc,
    placeholder: t('editor.placeholder'),
    onUpdate,
    onSelectionChange: checkTriggers
  })
  applying = false
  loading.value = false
  updateDerived()
  void applyReveal()
}

async function loadDisk(): Promise<void> {
  if (!currentId) return
  const result = await ctx.api.note.read(asNoteId(currentId))
  if (!result.ok) return
  const parsed = markdownToDocument(result.data.content)
  frontmatter.value = parsed.frontmatter
  sourceValue.value = result.data.content
  lastSaved = result.data.content
  applying = true
  editor.value?.commands.setContent(parsed.doc, false)
  applying = false
  updateDerived()
  ctx.workspace.setSaveState('saved')
  external.value = false
}

function keepCurrent(): void {
  external.value = false
}

function onMouseMove(event: MouseEvent): void {
  const instance = editor.value
  if (!instance || ctx.workspace.sourceMode) {
    handle.value = null
    return
  }
  const target = event.target
  if (target instanceof Element && target.closest('.block-handle')) return
  const info = instance.view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!info) {
    handle.value = null
    return
  }
  const resolved = instance.state.doc.resolve(info.pos)
  if (resolved.depth === 0) {
    handle.value = null
    return
  }
  const blockPos = resolved.before(1)
  const coords = instance.view.coordsAtPos(blockPos + 1)
  handle.value = { top: coords.top, left: coords.left - 30, pos: blockPos }
}

function openBlockMenu(): void {
  if (!handle.value) return
  blockMenu.value = {
    open: true,
    x: handle.value.left,
    y: handle.value.top,
    pos: handle.value.pos
  }
}

const blockMenuItems = computed<MenuItem[]>(() => {
  const instance = editor.value
  const node = instance?.state.doc.nodeAt(blockMenu.value.pos)
  const items: MenuItem[] = [
    {
      id: 'convert',
      label: t('editor.convertTo'),
      children: [
        { id: 'convert:paragraph', label: '段落', icon: 'paragraph' },
        { id: 'convert:h1', label: '标题 1', icon: 'heading' },
        { id: 'convert:h2', label: '标题 2', icon: 'heading' },
        { id: 'convert:h3', label: '标题 3', icon: 'heading' },
        { id: 'convert:bullet', label: '无序列表', icon: 'list' },
        { id: 'convert:task', label: '任务列表', icon: 'task' },
        { id: 'convert:quote', label: '引用', icon: 'quote' },
        { id: 'convert:code', label: '代码块', icon: 'code' },
        { id: 'convert:math', label: '公式块', icon: 'math' }
      ]
    },
    { id: 'insertBelow', label: t('editor.insertBelow') }
  ]
  if (node?.type.name === 'codeBlock') {
    items.push({
      id: 'collapse',
      label: node.attrs.collapsed ? t('editor.expand') : t('editor.collapse')
    })
  }
  items.push(
    { id: 'sep', label: '', separator: true },
    { id: 'copyLink', label: t('editor.copyBlockLink') },
    { id: 'copyEmbed', label: t('editor.copyEmbed') },
    { id: 'copyMarkdown', label: t('editor.copyMarkdown') },
    { id: 'sep2', label: '', separator: true },
    { id: 'delete', label: t('editor.deleteBlock'), danger: true }
  )
  return items
})

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast(t('editor.copied'))
  } catch {
    toast(t('editor.copied'), 'error')
  }
}

function convertBlock(pos: number, kind: string): void {
  const instance = editor.value
  if (!instance) return
  const node = instance.state.doc.nodeAt(pos)
  if (!node) return
  const text = node.isTextblock
    ? node.textContent
    : String(node.attrs.code ?? node.attrs.latex ?? '')

  if (!node.isTextblock) {
    instance
      .chain()
      .focus()
      .insertContentAt(
        { from: pos, to: pos + node.nodeSize },
        { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }
      )
      .run()
  }

  if (kind === 'code' || kind === 'math') {
    const type = kind === 'code' ? 'codeBlock' : 'mathBlock'
    const attrs = kind === 'code' ? { language: null, code: text } : { latex: text }
    instance.chain().focus().insertContentAt({ from: pos, to: pos + node.nodeSize }, { type, attrs }).run()
    return
  }

  const chain = instance.chain().focus().setTextSelection(pos + 1)
  if (kind === 'paragraph') chain.setParagraph().run()
  else if (kind === 'h1') chain.setHeading({ level: 1 }).run()
  else if (kind === 'h2') chain.setHeading({ level: 2 }).run()
  else if (kind === 'h3') chain.setHeading({ level: 3 }).run()
  else if (kind === 'bullet') chain.toggleBulletList().run()
  else if (kind === 'task') chain.toggleTaskList().run()
  else if (kind === 'quote') chain.toggleBlockquote().run()
}

async function onBlockMenuSelect(id: string): Promise<void> {
  const pos = blockMenu.value.pos
  blockMenu.value.open = false
  const instance = editor.value
  if (!instance) return
  const node = instance.state.doc.nodeAt(pos)
  if (!node) return

  if (id === 'insertBelow') {
    instance.chain().focus().insertContentAt(pos + node.nodeSize, { type: 'paragraph' }).run()
    return
  }
  if (id === 'collapse') {
    instance.view.dispatch(
      instance.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        collapsed: !node.attrs.collapsed
      })
    )
    return
  }
  if (id === 'copyMarkdown') {
    const markdown = documentToMarkdown({ type: 'doc', content: [node.toJSON()] }).trim()
    await writeClipboard(markdown)
    return
  }
  if ((id === 'copyLink' || id === 'copyEmbed') && currentId) {
    const ordinal = instance.state.doc.resolve(pos).index(0)
    const assigned = await ctx.api.block.assign(asNoteId(currentId), ordinal)
    if (!assigned.ok) return
    const title = ctx.workspace.currentNoteTitle
    const prefix = id === 'copyEmbed' ? '!' : ''
    await writeClipboard(`${prefix}[[${title}#^${assigned.data.blockId}]]`)
    return
  }
  if (id === 'delete') {
    instance.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
    return
  }
  if (id.startsWith('convert:')) convertBlock(pos, id.slice('convert:'.length))
}

async function createNote(): Promise<void> {
  const result = await ctx.api.note.create(null)
  if (result.ok) ctx.workspace.openNote(result.data.id)
}

const stops: (() => void)[] = []

watch(
  () => ctx.workspace.currentNoteId,
  (noteId) => void load(noteId),
  { immediate: true }
)

watch(
  () => ctx.workspace.sourceMode,
  (enabled) => {
    if (enabled) {
      sourceValue.value = editor.value ? editorMarkdown() : sourceValue.value
      return
    }
    if (!editor.value) return
    const parsed = markdownToDocument(sourceValue.value)
    frontmatter.value = parsed.frontmatter
    applying = true
    editor.value.commands.setContent(parsed.doc, false)
    applying = false
    updateDerived()
  }
)

watch(sourceValue, () => {
  if (!ctx.workspace.sourceMode) return
  ctx.workspace.setSaveState('dirty')
  scheduleSave()
})

watch(
  () => ctx.workspace.saveRequest,
  () => void saveNow()
)

watch(
  () => ctx.workspace.findRequest,
  () => {
    if (ctx.workspace.currentNoteId) findOpen.value = true
  }
)

watch(
  () => ctx.workspace.reveal?.nonce,
  () => void applyReveal()
)

onMounted(() => {
  stops.push(
    ctx.events.on('note:external-change', ({ noteId }) => {
      if (noteId === currentId) external.value = true
    })
  )
  stops.push(
    ctx.events.on('note:renamed', ({ noteId }) => {
      if (noteId === currentId) void load(noteId)
    })
  )
  stops.push(
    ctx.workspace.onFocusHeading((pos) => {
      const instance = editor.value
      if (!instance) return
      instance.chain().focus().setTextSelection(pos + 1).scrollIntoView().run()
    })
  )
})

watch(
  () => ctx.workspace.insertHeadingRequest,
  () => {
    if (!editor.value) return
    editor.value.chain().focus().setHeading({ level: 1 }).run()
  }
)

onBeforeUnmount(() => {
  for (const stop of stops) stop()
  if (saveTimer) clearTimeout(saveTimer)
  void saveNow()
  editor.value?.destroy()
  editor.value = null
})
</script>

<template>
  <div class="note-editor" @mousemove="onMouseMove" @mouseleave="handle = null">
    <FindBar :editor="editor" :open="findOpen" @close="findOpen = false" />
    <ExternalChangeBanner
      :visible="external"
      :on-load-disk="loadDisk"
      :on-keep-current="keepCurrent"
    />

    <div v-if="isEmpty" class="empty-state">
      <p>{{ t('shell.noNote') }}</p>
      <BaseButton variant="ghost" size="sm" @click="createNote">
        {{ t('explorer.newNote') }}
      </BaseButton>
    </div>

    <div
      v-else
      class="editor-scroll"
      @scroll="handle = null"
    >
      <SourceMode v-if="ctx.workspace.sourceMode" v-model="sourceValue" />
      <div v-else class="wysiwyg">
        <EditorContent :editor="editor ?? undefined" class="editor-host" />
      </div>
      <div v-if="loading" class="skeleton">
        <div class="skeleton-line" style="width: 60%" />
        <div class="skeleton-line" style="width: 90%" />
        <div class="skeleton-line" style="width: 75%" />
      </div>
      <p v-if="error" class="editor-error">{{ error }}</p>
    </div>

    <button
      v-if="handle && !ctx.workspace.sourceMode && !isEmpty"
      class="block-handle no-drag"
      type="button"
      aria-label="块菜单"
      :style="{ top: `${handle.top}px`, left: `${handle.left}px` }"
      @mousedown.prevent="openBlockMenu"
    >
      <Icon name="dots" :size="14" />
    </button>

    <SlashMenu
      :editor="editor"
      :open="slash.open"
      :x="slash.x"
      :y="slash.y"
      :query="slash.query"
      :start="slash.start"
      @close="slash.open = false"
    />

    <WikiLinkPopover
      :editor="editor"
      :open="wiki.open"
      :x="wiki.x"
      :y="wiki.y"
      :query="wiki.query"
      :range="wiki.range"
      :mode="wiki.mode"
      @close="wiki.open = false"
    />

    <BaseMenu
      :open="blockMenu.open"
      :x="blockMenu.x"
      :y="blockMenu.y"
      :items="blockMenuItems"
      @select="onBlockMenuSelect"
      @close="blockMenu.open = false"
    />
  </div>
</template>

<style scoped>
.note-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.editor-scroll {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.wysiwyg {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 24px 96px;
}

.editor-host {
  min-height: 300px;
}

.empty-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 13px;
}

.empty-state p {
  margin: 0;
}

.skeleton {
  position: absolute;
  inset: 32px 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
  margin: 0 auto;
  padding: 0 24px;
  pointer-events: none;
}

.skeleton-line {
  height: 16px;
  background: var(--bg-hover);
  border-radius: 4px;
}

.editor-error {
  margin: 16px 24px;
  font-size: 12px;
  color: var(--danger);
}

.block-handle {
  position: fixed;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: var(--text-tertiary);
  background: var(--bg-app);
}

.block-handle:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
