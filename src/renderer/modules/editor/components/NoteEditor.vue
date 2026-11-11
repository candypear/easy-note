<script setup lang="ts">
// 笔记编辑器主组件：管理 TipTap 实例生命周期、Markdown 加载/防抖保存、源码模式切换，
// 以及斜杠菜单、wiki 链接补全、块手柄/右键菜单、表格工具条、外部变更与块定位等交互。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { EditorContent } from '@tiptap/vue-3'
import type { Editor } from '@tiptap/vue-3'
import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { asNoteId } from '@shared/types/brand'
import { useContext } from '../../../app/providers'
import BaseButton from '../../../ui/button/BaseButton.vue'
import BaseDialog from '../../../ui/dialog/BaseDialog.vue'
import BaseInput from '../../../ui/input/BaseInput.vue'
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
type TableAlign = 'left' | 'center' | 'right'
const TABLE_TOOLBAR_WIDTH = 82
const TABLE_TOOLBAR_HEIGHT = 30
const TABLE_ALIGNS: { value: TableAlign; icon: string; labelKey: string }[] = [
  { value: 'left', icon: 'alignLeft', labelKey: 'editor.alignLeft' },
  { value: 'center', icon: 'alignCenter', labelKey: 'editor.alignCenter' },
  { value: 'right', icon: 'alignRight', labelKey: 'editor.alignRight' }
]
const tableToolbar = ref<{
  pos: number
  top: number
  left: number
  align: TableAlign
} | null>(null)
const contextMenu = ref({
  open: false,
  kind: 'block' as 'block' | 'table',
  x: 0,
  y: 0,
  pos: 0,
  cellPos: null as number | null
})
const tableSize = ref({ open: false, rows: '3', cols: '3', tablePos: 0 })

// currentId：当前加载的笔记；saveTimer：防抖定时器；lastSaved：上次落盘内容，用于跳过无变化保存；
// applying：程序化写入文档期间置 true，抑制 onUpdate 误标 dirty / 触发保存
let currentId: string | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastSaved = ''
let applying = false

const isEmpty = computed(() => !ctx.workspace.currentNoteId)

// 从当前文档派生统计、大纲、纯文本，同步到 workspace 供状态栏/大纲/反链等模块使用
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

// 取当前待保存文本：源码模式直接用 CodeMirror 的值，否则由文档序列化（带 frontmatter）
function currentMarkdown(): string {
  if (ctx.workspace.sourceMode) return sourceValue.value
  return editorMarkdown()
}

// 立即保存：先取消待触发的防抖任务；与 lastSaved 相同则跳过 IPC，避免无谓写盘
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

// 防抖保存：每次输入重置 500ms 计时，停止输入后才落盘
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveNow(), 500)
}

function closeFlyouts(): void {
  slash.value.open = false
  wiki.value.open = false
}

// 检测光标前文本以触发斜杠菜单和 wiki 链接补全：
// textBetween 用 \ufffc 占位原子节点（图片/公式等），防止把节点内容当普通文本匹配；
// 斜杠要求位于行首或空白后，wiki 匹配未闭合的 [[ 或 ![[（后者为嵌入模式）。
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
    // 用光标屏幕坐标定位菜单；start 记录斜杠的文档位置，供选中后删除 "/查询词"
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
    // range 覆盖从 [[ 起到光标的整个触发文本，选中候选后整体替换为节点
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

// TipTap 文档更新回调：程序化写入（applying）时跳过，否则标脏、刷新派生数据并防抖保存
function onUpdate(): void {
  if (applying) return
  ctx.workspace.setSaveState('dirty')
  updateDerived()
  checkTriggers()
  scheduleSave()
}

// 把顶层块的序号（主进程索引用的 ordinal）换算为文档位置：累加前序兄弟的 nodeSize
function posAtOrdinal(doc: PMNode, ordinal: number): number | null {
  if (ordinal < 0 || ordinal >= doc.childCount) return null
  let pos = 0
  for (let index = 0; index < ordinal; index += 1) pos += doc.child(index).nodeSize
  return pos
}

function blockAt(instance: Editor, pos: number): PMNode | null {
  const doc = instance.state.doc
  if (pos < 0 || pos >= doc.content.size) return null
  return doc.nodeAt(pos)
}

// 从事件目标向上找编辑器根的直接子元素，即顶层块对应的 DOM
function topLevelElement(root: HTMLElement, target: Element): Element | null {
  let el: Element | null = target
  while (el && el.parentElement !== root) el = el.parentElement
  return el === root ? null : el
}

// DOM 元素 → 顶层块位置：posAtDOM 可能落在块内部深层，用 resolve().before(1) 提升到顶层；
// NodeView 等场景 posAtDOM 可能抛异常，需捕获返回 null
function blockPosForElement(instance: Editor, el: Element): number | null {
  let pos: number
  try {
    pos = instance.view.posAtDOM(el, 0)
  } catch {
    return null
  }
  const doc = instance.state.doc
  if (pos < 0 || pos > doc.content.size) return null
  const $pos = doc.resolve(pos)
  if ($pos.depth > 0) pos = $pos.before(1)
  return doc.nodeAt(pos) ? pos : null
}

function blockPosAt(instance: Editor, target: Element): number | null {
  const root = instance.view.dom
  if (target === root || !root.contains(target)) return null
  const el = topLevelElement(root, target)
  if (!el) return null
  return blockPosForElement(instance, el)
}

// 若事件目标在表格单元格内，沿解析路径向上找 table 祖先，返回表位置与单元格内位置
function tableContextAt(
  instance: Editor,
  target: Element
): { tablePos: number; cellPos: number } | null {
  const cell = target.closest('td, th')
  if (!(cell instanceof HTMLElement) || !instance.view.dom.contains(cell)) return null
  let cellPos: number
  try {
    cellPos = instance.view.posAtDOM(cell, 0)
  } catch {
    return null
  }
  const $cell = instance.state.doc.resolve(cellPos)
  for (let depth = $cell.depth; depth > 0; depth -= 1) {
    if ($cell.node(depth).type.name === 'table') {
      return { tablePos: $cell.before(depth), cellPos }
    }
  }
  return null
}

// 以首行首格的对齐代表整表对齐（工具条按整表统一设置）
function tableAlignOf(table: PMNode): TableAlign {
  const value = table.firstChild?.firstChild?.attrs.align
  return value === 'center' || value === 'right' ? value : 'left'
}

// 从选区推断所在表格：整表 NodeSelection 直接取 from，否则沿祖先链找 table
function tablePosFromSelection(instance: Editor): number | null {
  const selection = instance.state.selection
  if (selection instanceof NodeSelection) {
    const node = instance.state.doc.nodeAt(selection.from)
    return node?.type.name === 'table' ? selection.from : null
  }
  const $from = selection.$from
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'table') return $from.before(depth)
  }
  return null
}

// 同步表格对齐工具条：定位到表格 DOM 右上角上方，夹在视口内；
// 表格滚出可视区（顶部越过 48px 标题栏或底部超出窗口）时隐藏。
function syncTableToolbar(forcePos?: number): void {
  const instance = editor.value
  if (!instance || ctx.workspace.sourceMode) {
    tableToolbar.value = null
    return
  }
  const pos = forcePos ?? tablePosFromSelection(instance)
  if (pos === null) {
    tableToolbar.value = null
    return
  }
  const table = instance.state.doc.nodeAt(pos)
  if (!table || table.type.name !== 'table') {
    tableToolbar.value = null
    return
  }
  const dom = instance.view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) {
    tableToolbar.value = null
    return
  }
  const rect = dom.getBoundingClientRect()
  if (rect.bottom < 48 || rect.top > window.innerHeight) {
    tableToolbar.value = null
    return
  }
  const left = Math.min(
    Math.max(8, rect.right - TABLE_TOOLBAR_WIDTH),
    Math.max(8, window.innerWidth - TABLE_TOOLBAR_WIDTH - 8)
  )
  const top = Math.min(
    Math.max(48, rect.top - TABLE_TOOLBAR_HEIGHT - 4),
    Math.max(48, window.innerHeight - TABLE_TOOLBAR_HEIGHT - 8)
  )
  tableToolbar.value = { pos, left, top, align: tableAlignOf(table) }
}

// 整表统一设置对齐：pos + 2 跳过 table 与首行 row 的起始 token，
// 再加行/格在父节点内的偏移即为单元格位置；结束后保持整表选中以便工具条继续显示。
function applyTableAlignment(align: TableAlign): void {
  const instance = editor.value
  const toolbar = tableToolbar.value
  if (!instance || !toolbar) return
  const table = instance.state.doc.nodeAt(toolbar.pos)
  if (!table || table.type.name !== 'table') return
  const tr = instance.state.tr
  table.forEach((row, rowOffset) => {
    row.forEach((cell, cellOffset) => {
      tr.setNodeMarkup(toolbar.pos + 2 + rowOffset + cellOffset, undefined, {
        ...cell.attrs,
        align
      })
    })
  })
  tr.setSelection(NodeSelection.create(tr.doc, toolbar.pos))
  instance.view.dispatch(tr)
  instance.view.focus()
  tableToolbar.value = { ...toolbar, align }
}

function onSelectionChange(): void {
  checkTriggers()
  syncTableToolbar()
}

// 滚动时隐藏块手柄（位置已失效）并重新计算表格工具条坐标
function onEditorScroll(): void {
  handle.value = null
  syncTableToolbar()
}

function tableDimensions(table: PMNode): { rows: number; cols: number } {
  let cols = 0
  table.forEach((row) => {
    cols = Math.max(cols, row.childCount)
  })
  return { rows: table.childCount, cols }
}

function focusCell(instance: Editor, cellPos: number): boolean {
  const doc = instance.state.doc
  if (cellPos < 0 || cellPos > doc.content.size) return false
  instance.view.dispatch(instance.state.tr.setSelection(TextSelection.near(doc.resolve(cellPos))))
  instance.view.focus()
  return true
}

// 给目标块加短暂高亮动画，用于跳转定位后的视觉反馈
function flashBlock(pos: number): void {
  const instance = editor.value
  if (!instance) return
  const node = blockAt(instance, pos)
  if (!node) return
  const dom = instance.view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return
  dom.classList.add('block-flash')
  setTimeout(() => dom.classList.remove('block-flash'), 1500)
}

// 响应"定位到块"请求（如点击反链/嵌入跳转）：按块 ID 查主进程索引拿 ordinal，
// 换算成文档位置后滚动并高亮；异步返回后校验编辑器/笔记/nonce 未变，防止过期请求生效。
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
  if (editor.value !== instance || currentId !== target.noteId || ctx.workspace.reveal?.nonce !== target.nonce) {
    return
  }
  const hit = blocks.data.find((block) => block.id === target.blockId)
  if (!hit) return
  const doc = instance.state.doc
  const pos = posAtOrdinal(doc, hit.ordinal)
  if (pos === null || pos >= doc.content.size) return
  instance.chain().focus().setTextSelection(pos + 1).scrollIntoView().run()
  flashBlock(pos)
}

// 加载笔记：切换前先把上一篇立即落盘，销毁旧编辑器实例，
// 读取 Markdown 解析为 ProseMirror JSON 后重建编辑器；applying 防止初始化被当作编辑。
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
  if (currentId !== noteId) ctx.workspace.setHeadings([])
  currentId = noteId
  closeFlyouts()
  tableToolbar.value = null
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
  // setContent/创建期间的 onUpdate 不应标脏，因此用 applying 包住
  editor.value = createEditor({
    content: parsed.doc,
    placeholder: t('editor.placeholder'),
    onUpdate,
    onSelectionChange
  })
  applying = false
  loading.value = false
  updateDerived()
  void applyReveal()
}

// 外部冲突选择"加载磁盘"：重读文件并静默替换文档（setContent 第二参 false 不触发 update），
// 同时刷新 lastSaved 基准，丢弃本地未保存修改。
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

// 选择"保留当前"：仅关闭提示条；本地内容仍是脏状态，下次保存会覆盖磁盘版本
function keepCurrent(): void {
  external.value = false
}

// 鼠标悬停时计算块手柄位置（块左侧 30px）；同一块内移动不重复更新
function onMouseMove(event: MouseEvent): void {
  const instance = editor.value
  if (!instance || ctx.workspace.sourceMode) {
    handle.value = null
    return
  }
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('.block-handle')) return
  const root = instance.view.dom
  if (target === root || !root.contains(target)) return

  const el = topLevelElement(root, target)
  if (!el) return
  const pos = blockPosForElement(instance, el)
  if (pos === null) return
  if (handle.value?.pos === pos) return

  const rect = el.getBoundingClientRect()
  handle.value = { top: rect.top, left: rect.left - 30, pos }
}

function selectBlock(pos: number): void {
  const instance = editor.value
  if (!instance) return
  const doc = instance.state.doc
  if (!doc.nodeAt(pos)) return
  instance.view.dispatch(instance.state.tr.setSelection(NodeSelection.create(doc, pos)))
  instance.view.focus()
  syncTableToolbar(pos)
}

function onHandleClick(): void {
  if (!handle.value) return
  selectBlock(handle.value.pos)
}

// 右键菜单：块已整体选中（NodeSelection）时弹块菜单；
// 否则若命中表格单元格则弹表格菜单；普通文本区域交给系统默认菜单。
function onEditorContextMenu(event: MouseEvent): void {
  const instance = editor.value
  if (!instance || ctx.workspace.sourceMode) return
  const target = event.target
  if (!(target instanceof Element)) return
  const root = instance.view.dom
  if (!root.contains(target)) return

  const table = tableContextAt(instance, target)
  const blockPos = blockPosAt(instance, target)
  const selection = instance.state.selection

  if (blockPos !== null && selection instanceof NodeSelection && selection.from === blockPos) {
    event.preventDefault()
    contextMenu.value = {
      open: true,
      kind: 'block',
      x: event.clientX,
      y: event.clientY,
      pos: blockPos,
      cellPos: table?.cellPos ?? null
    }
    return
  }

  if (table) {
    event.preventDefault()
    contextMenu.value = {
      open: true,
      kind: 'table',
      x: event.clientX,
      y: event.clientY,
      pos: table.tablePos,
      cellPos: table.cellPos
    }
  }
}

function tableInsertItems(): MenuItem[] {
  return [
    { id: 'table:rowBefore', label: t('editor.rowBefore'), icon: 'arrowUp' },
    { id: 'table:rowAfter', label: t('editor.rowAfter'), icon: 'arrowDown' },
    { id: 'table:colBefore', label: t('editor.colBefore'), icon: 'chevronLeft' },
    { id: 'table:colAfter', label: t('editor.colAfter'), icon: 'chevronRight' }
  ]
}

const menuItems = computed<MenuItem[]>(() => {
  const instance = editor.value
  const menu = contextMenu.value

  if (menu.kind === 'table') {
    return [
      ...tableInsertItems(),
      { id: 'tableSep', label: '', separator: true },
      { id: 'table:size', label: t('editor.tableSize'), icon: 'table' },
      { id: 'tableSep2', label: '', separator: true },
      { id: 'table:delete', label: t('editor.deleteTable'), icon: 'trash', danger: true }
    ]
  }

  const node = instance ? blockAt(instance, menu.pos) : null
  const items: MenuItem[] = []

  if (node?.type.name === 'table') {
    if (menu.cellPos !== null) items.push(...tableInsertItems())
    items.push(
      { id: 'table:size', label: t('editor.tableSize'), icon: 'table' },
      { id: 'tableSep', label: '', separator: true }
    )
  } else {
    items.push({
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
    })
  }

  items.push({ id: 'insertBelow', label: t('editor.insertBelow') })
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

// 块类型转换：原子块（代码/公式/图片等）无法直接 setNode，
// 先提取其文本替换为段落；转代码/公式则直接整块替换并搬运文本。
function convertBlock(pos: number, kind: string): void {
  const instance = editor.value
  if (!instance) return
  const node = blockAt(instance, pos)
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

function clampTableCount(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 1
  return Math.min(50, Math.max(1, parsed))
}

function openTableSize(tablePos: number): void {
  const instance = editor.value
  if (!instance) return
  const table = blockAt(instance, tablePos)
  if (!table || table.type.name !== 'table') return
  const { rows, cols } = tableDimensions(table)
  tableSize.value = { open: true, rows: String(rows), cols: String(cols), tablePos }
}

// 重建整表以调整行列数：保留已有单元格，新行以现有行（或末行）为模板
// 复制行属性与表头类型，新增格子用 createAndFill 生成合法空单元格。
function resizeTable(instance: Editor, tablePos: number, rows: number, cols: number): void {
  const table = blockAt(instance, tablePos)
  if (!table || table.type.name !== 'table') return
  const schema = instance.state.schema
  const cellType = schema.nodes.tableCell
  const headerType = schema.nodes.tableHeader
  if (!cellType || !headerType) return

  const nextRows: PMNode[] = []
  for (let r = 0; r < rows; r += 1) {
    const source = r < table.childCount ? table.child(r) : null
    const template = source ?? table.child(table.childCount - 1)
    const header = template.child(0)?.type.name === 'tableHeader'
    const cells: PMNode[] = []
    for (let c = 0; c < cols; c += 1) {
      const existing = source && c < source.childCount ? source.child(c) : null
      cells.push(existing ?? (header ? headerType : cellType).createAndFill()!)
    }
    nextRows.push(template.type.create(source?.attrs ?? template.attrs, cells))
  }

  const nextTable = table.type.create(table.attrs, nextRows)
  const tr = instance.state.tr.replaceWith(tablePos, tablePos + table.nodeSize, nextTable)
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tablePos + 2, tr.doc.content.size))))
  instance.view.dispatch(tr.scrollIntoView())
  instance.view.focus()
}

function applyTableSize(): void {
  const instance = editor.value
  if (!instance) return
  const { tablePos } = tableSize.value
  const rows = clampTableCount(tableSize.value.rows)
  const cols = clampTableCount(tableSize.value.cols)
  tableSize.value.open = false
  resizeTable(instance, tablePos, rows, cols)
}

function runTableAction(
  instance: Editor,
  action: string,
  tablePos: number,
  cellPos: number | null
): void {
  if (action === 'size') {
    openTableSize(tablePos)
    return
  }
  if (action === 'delete') {
    const table = blockAt(instance, tablePos)
    if (!table || table.type.name !== 'table') return
    instance
      .chain()
      .focus()
      .deleteRange({ from: tablePos, to: tablePos + table.nodeSize })
      .run()
    return
  }
  if (cellPos === null) return
  // TipTap 表格命令基于当前选区，先把光标放进右键命中的单元格再执行
  if (!focusCell(instance, cellPos)) return
  const chain = instance.chain().focus()
  if (action === 'rowBefore') chain.addRowBefore().run()
  else if (action === 'rowAfter') chain.addRowAfter().run()
  else if (action === 'colBefore') chain.addColumnBefore().run()
  else if (action === 'colAfter') chain.addColumnAfter().run()
}

async function onMenuSelect(id: string): Promise<void> {
  const menu = contextMenu.value
  contextMenu.value.open = false
  const instance = editor.value
  if (!instance) return

  if (id.startsWith('table:')) {
    runTableAction(instance, id.slice('table:'.length), menu.pos, menu.cellPos)
    return
  }

  const pos = menu.pos
  const node = blockAt(instance, pos)
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
    // 块 ID 可能尚未分配：按顶层序号请求主进程写回 ^id 并返回，再拼 [[标题#^id]] 引用
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

// 源码模式切换：进入时把当前文档序列化为 Markdown 填入 CodeMirror；
// 退出时重新解析源码并静默写回 TipTap，保证两个视图内容一致。
watch(
  () => ctx.workspace.sourceMode,
  (enabled) => {
    if (enabled) {
      tableToolbar.value = null
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

// 源码模式下编辑走 v-model 而非 TipTap onUpdate，需单独标脏并防抖保存
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
  const onResize = (): void => syncTableToolbar()
  window.addEventListener('resize', onResize)
  stops.push(() => window.removeEventListener('resize', onResize))
  stops.push(
    // 主进程 watcher 检测到磁盘文件被外部修改：仅当前笔记受影响时显示冲突提示条
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
    // 大纲点击跳转：缓存的 pos 可能因编辑失效，先校验该位置仍是同标题，
    // 不匹配则按层级+文本全文搜索兜底。
    ctx.workspace.onFocusHeading((heading) => {
      const instance = editor.value
      if (!instance) return
      const doc = instance.state.doc
      const at = blockAt(instance, heading.pos)
      const same =
        at?.type.name === 'heading' &&
        Number(at.attrs.level ?? 1) === heading.level &&
        at.textContent.trim() === heading.text
      let pos = same ? heading.pos : -1
      if (pos < 0) {
        doc.descendants((node, nodePos) => {
          if (pos >= 0) return false
          if (node.type.name !== 'heading') return true
          if (Number(node.attrs.level ?? 1) !== heading.level) return true
          if (node.textContent.trim() !== heading.text) return true
          pos = nodePos
          return false
        })
      }
      if (pos < 0 || pos >= doc.content.size) return
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
  // 卸载前强制落盘，避免防抖窗口内的最后编辑丢失
  void saveNow()
  editor.value?.destroy()
  editor.value = null
})
</script>

<template>
  <div
    class="note-editor"
    @mousemove="onMouseMove"
    @mouseleave="handle = null"
    @contextmenu="onEditorContextMenu"
  >
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
      @scroll="onEditorScroll"
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
      aria-label="选择块"
      :style="{ top: `${handle.top}px`, left: `${handle.left}px` }"
      @mousedown.prevent="onHandleClick"
    >
      <Icon name="grip" :size="16" />
    </button>

    <div
      v-if="tableToolbar && !ctx.workspace.sourceMode && !isEmpty"
      class="table-toolbar no-drag"
      role="toolbar"
      :aria-label="t('editor.tableAlign')"
      :style="{ top: `${tableToolbar.top}px`, left: `${tableToolbar.left}px` }"
    >
      <button
        v-for="option in TABLE_ALIGNS"
        :key="option.value"
        type="button"
        :class="{ active: tableToolbar.align === option.value }"
        :aria-label="t(option.labelKey)"
        :aria-pressed="tableToolbar.align === option.value"
        :title="t(option.labelKey)"
        @mousedown.prevent
        @click="applyTableAlignment(option.value)"
      >
        <Icon :name="option.icon" :size="14" />
      </button>
    </div>

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
      :open="contextMenu.open"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="menuItems"
      @select="onMenuSelect"
      @close="contextMenu.open = false"
    />

    <BaseDialog
      :open="tableSize.open"
      :title="t('editor.tableSizeTitle')"
      :width="300"
      @close="tableSize.open = false"
    >
      <div class="table-size">
        <label class="table-size-field">
          <span>{{ t('editor.rows') }}</span>
          <BaseInput v-model="tableSize.rows" />
        </label>
        <label class="table-size-field">
          <span>{{ t('editor.columns') }}</span>
          <BaseInput v-model="tableSize.cols" />
        </label>
      </div>
      <template #footer>
        <BaseButton variant="ghost" size="sm" @click="tableSize.open = false">
          {{ t('menu.cancel') }}
        </BaseButton>
        <BaseButton variant="primary" size="sm" @click="applyTableSize">
          {{ t('editor.apply') }}
        </BaseButton>
      </template>
    </BaseDialog>
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
  border-radius: var(--radius-inline);
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
  border-radius: var(--radius-inline);
  color: var(--text-tertiary);
  background: var(--bg-app);
}

.block-handle:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.table-toolbar {
  position: fixed;
  z-index: 21;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-menu);
  box-shadow: var(--shadow-menu);
}

.table-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-inline);
  color: var(--text-secondary);
}

.table-toolbar button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.table-toolbar button.active {
  background: var(--bg-selected);
  color: var(--text-primary);
}

.table-size {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.table-size-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.table-size-field > span {
  flex: none;
  white-space: nowrap;
}

.table-size-field :deep(.base-input) {
  flex: 1;
  min-width: 0;
}

.table-size-field :deep(.base-input:focus-within) {
  border-color: var(--border-strong);
  box-shadow: none;
}

.table-size-field :deep(input:focus-visible) {
  box-shadow: none;
}
</style>
