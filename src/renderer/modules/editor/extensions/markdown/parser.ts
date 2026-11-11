// Markdown → ProseMirror JSON 解析器：基于 remark（GFM + math）生成 mdast，
// 再手工映射为 TipTap 节点；wiki 链接/块引用在文本层用正则识别，frontmatter 原样保留。
import type { JSONContent } from '@tiptap/core'
import type {
  Blockquote,
  Break,
  Code,
  Delete,
  Emphasis,
  Heading,
  Html,
  Image,
  InlineCode,
  Link,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Strong,
  Table,
  TableCell,
  TableRow,
  Text,
  ThematicBreak
} from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { splitFrontmatter } from '@shared/utils/markdown'

interface MathNode {
  type: 'math'
  value: string
}

interface InlineMathNode {
  type: 'inlineMath'
  value: string
}

type Mark = NonNullable<JSONContent['marks']>[number]

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

// WIKI：匹配 [[目标]] 与 ![[目标]]（嵌入）；EMBED_ONLY：整段仅为一个嵌入时升级为块级嵌入
const WIKI = /(!?)\[\[([^\]\n]+)\]\]/g
const EMBED_ONLY = /^!\[\[([^\]\n]+)\]\]$/

export interface ParsedDocument {
  doc: JSONContent
  frontmatter: string
}

function text(value: string, marks: Mark[] = []): JSONContent {
  return marks.length > 0 ? { type: 'text', text: value, marks } : { type: 'text', text: value }
}

// 把文本按 wiki 语法切分为普通文本与链接节点：
// [[笔记#^块]] → blockRef，[[笔记]] → wikiLink，![[...]] → embedInline；
// 普通文本片段继承外层 marks（加粗等格式内的 wiki 链接仍保留格式）。
function splitWiki(value: string, marks: Mark[]): JSONContent[] {
  const result: JSONContent[] = []
  let last = 0
  WIKI.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WIKI.exec(value)) !== null) {
    if (match.index > last) result.push(text(value.slice(last, match.index), marks))
    const raw = match[2] ?? ''
    const embed = match[1] === '!'
    if (embed) {
      const separator = raw.indexOf('#^')
      if (separator >= 0) {
        result.push({
          type: 'embedInline',
          attrs: { note: raw.slice(0, separator), blockId: raw.slice(separator + 2) }
        })
      } else {
        result.push({ type: 'embedInline', attrs: { note: raw, blockId: '' } })
      }
    } else {
      const separator = raw.indexOf('#^')
      if (separator >= 0) {
        result.push({
          type: 'blockRef',
          attrs: { note: raw.slice(0, separator), blockId: raw.slice(separator + 2) }
        })
      } else {
        result.push({ type: 'wikiLink', attrs: { target: raw } })
      }
    }
    last = match.index + match[0].length
  }
  if (last < value.length) result.push(text(value.slice(last), marks))
  if (result.length === 0) result.push(text(value, marks))
  return result
}

// 行内 mdast → TipTap：格式节点（strong/em 等）转成 marks 递归下传；
// 图片/行内公式为原子节点；未识别类型降级取 value 文本或递归 children，保证内容不丢。
function inline(nodes: PhrasingContent[], marks: Mark[] = []): JSONContent[] {
  const result: JSONContent[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        result.push(...splitWiki((node as Text).value, marks))
        break
      case 'strong':
        result.push(...inline((node as Strong).children, [...marks, { type: 'bold' }]))
        break
      case 'emphasis':
        result.push(...inline((node as Emphasis).children, [...marks, { type: 'italic' }]))
        break
      case 'delete':
        result.push(...inline((node as Delete).children, [...marks, { type: 'strike' }]))
        break
      case 'inlineCode':
        result.push(text((node as InlineCode).value, [...marks, { type: 'code' }]))
        break
      case 'link': {
        const link = node as Link
        // 沿用现有映射：mdast 的 title 存入 link mark 的 target 属性
        const linkMark: Mark = {
          type: 'link',
          attrs: { href: link.url, target: link.title ?? null }
        }
        result.push(...inline(link.children, [...marks, linkMark]))
        break
      }
      case 'image': {
        const image = node as Image
        result.push({
          type: 'markdownImage',
          attrs: { src: image.url, alt: image.alt ?? '', title: image.title ?? null }
        })
        break
      }
      case 'inlineMath':
        result.push({ type: 'mathInline', attrs: { latex: (node as InlineMathNode).value } })
        break
      case 'break':
        result.push({ type: 'hardBreak' })
        break
      case 'html':
        result.push(text((node as Html).value, marks))
        break
      default:
        if ('value' in node && typeof node.value === 'string') {
          result.push(text(node.value, marks))
        } else if ('children' in node) {
          result.push(...inline(node.children as PhrasingContent[], marks))
        }
    }
  }
  return result
}

// 块级 mdast → TipTap 节点；yaml/definition 等不支持的块直接丢弃，
// 其余未知块保底转为 htmlBlock 保留原文。
function blocks(nodes: RootContent[]): JSONContent[] {
  const result: JSONContent[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph': {
        const paragraph = node as Paragraph
        // 整段只含 ![[笔记#^块]] 时升级为块级嵌入 embedBlock，否则按普通段落解析
        const onlyText =
          paragraph.children.length === 1 && paragraph.children[0]?.type === 'text'
            ? (paragraph.children[0] as Text).value.trim()
            : ''
        const embed = onlyText.match(EMBED_ONLY)
        if (embed) {
          const raw = embed[1] ?? ''
          const separator = raw.indexOf('#^')
          if (separator >= 0) {
            result.push({
              type: 'embedBlock',
              attrs: { note: raw.slice(0, separator), blockId: raw.slice(separator + 2) }
            })
            break
          }
        }
        result.push({ type: 'paragraph', content: inline(paragraph.children) })
        break
      }
      case 'heading': {
        const heading = node as Heading
        result.push({
          type: 'heading',
          attrs: { level: heading.depth },
          content: inline(heading.children)
        })
        break
      }
      case 'blockquote':
        result.push({ type: 'blockquote', content: blocks((node as Blockquote).children) })
        break
      case 'list':
        result.push(...listBlocks(node as List))
        break
      case 'code': {
        const code = node as Code
        result.push({
          type: 'codeBlock',
          attrs: { language: code.lang ?? null, code: code.value }
        })
        break
      }
      case 'math':
        result.push({ type: 'mathBlock', attrs: { latex: (node as unknown as MathNode).value } })
        break
      case 'thematicBreak':
        result.push({ type: 'horizontalRule' })
        break
      case 'html':
        result.push({ type: 'htmlBlock', attrs: { value: (node as Html).value } })
        break
      case 'table':
        result.push(tableBlock(node as Table))
        break
      case 'yaml':
      case 'definition':
      case 'footnoteDefinition':
        break
      default:
        if ('value' in node && typeof node.value === 'string') {
          result.push({ type: 'htmlBlock', attrs: { value: node.value } })
        }
    }
  }
  return result
}

// mdast 一个 list 可混合普通项与任务项，而 TipTap 的 taskList/bulletList 不能混排：
// 按 checked 有无切成连续分组，各自生成列表；有序列表的 start 按累计项数偏移，保持编号连续。
function listBlocks(list: List): JSONContent[] {
  const groups: { task: boolean; items: ListItem[] }[] = []
  for (const item of list.children) {
    const listItem = item as ListItem
    const task = listItem.checked === true || listItem.checked === false
    const last = groups[groups.length - 1]
    if (last && last.task === task) last.items.push(listItem)
    else groups.push({ task, items: [listItem] })
  }

  let ordinal = 0
  return groups.map((group) => {
    const items = group.items.map((listItem) => {
      const content = blocks(listItem.children)
      return {
        type: group.task ? 'taskItem' : 'listItem',
        attrs: group.task ? { checked: listItem.checked === true } : undefined,
        content: content.length > 0 ? content : [{ type: 'paragraph' }]
      }
    })
    const start = (list.start ?? 1) + ordinal
    ordinal += group.items.length
    if (group.task) return { type: 'taskList', content: items }
    return {
      type: list.ordered ? 'orderedList' : 'bulletList',
      attrs: list.ordered ? { start } : undefined,
      content: items
    }
  })
}

function tableCell(cell: TableCell, header: boolean, align: string | null | undefined): JSONContent {
  return {
    type: header ? 'tableHeader' : 'tableCell',
    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: align ?? null },
    content: [{ type: 'paragraph', content: inline(cell.children) }]
  }
}

// 表格：首行作表头，列对齐来自 GFM 的 align 数组；单元格内容包一层段落满足 schema
function tableBlock(table: Table): JSONContent {
  const rows = table.children.map((row: TableRow, index) =>
    ({
      type: 'tableRow',
      content: row.children.map((cell, column) =>
        tableCell(cell, index === 0, table.align?.[column] ?? null)
      )
    }) as JSONContent
  )
  return { type: 'table', content: rows }
}

// 入口：先剥离 frontmatter（不参与解析，保存时原样拼回），正文解析后映射为 doc JSON
export function markdownToDocument(markdown: string): ParsedDocument {
  const { prefix, body } = splitFrontmatter(markdown)
  const tree = parser.parse(body) as Root
  return {
    doc: { type: 'doc', content: blocks(tree.children) },
    frontmatter: prefix
  }
}
