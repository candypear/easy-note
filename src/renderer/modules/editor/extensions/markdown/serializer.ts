// ProseMirror JSON → Markdown 序列化器（parser 的逆映射）：先转回 mdast，
// 再由 remark-stringify 输出；wiki/嵌入等自定义节点通过自定义 handler 还原为 [[...]] 语法。
import type { JSONContent } from '@tiptap/core'
import type {
  BlockContent,
  Blockquote,
  Code,
  Heading,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableCell,
  TableRow
} from 'mdast'
import type { Options } from 'mdast-util-to-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'

type Mark = NonNullable<JSONContent['marks']>[number]

interface WikiLinkNode {
  type: 'wikiLink'
  target: string
}

interface BlockRefNode {
  type: 'blockRef'
  note: string
  blockId: string
}

interface EmbedBlockNode {
  type: 'embedBlock'
  note: string
  blockId: string
}

interface EmbedInlineNode {
  type: 'embedInline'
  note: string
  blockId: string
}

// 自定义节点的 Markdown 输出规则，与 parser 的识别规则一一对应；
// embedInline 无块 ID 时省略 #^ 后缀
const customHandlers = {
  wikiLink(node: WikiLinkNode) {
    return `[[${node.target}]]`
  },
  blockRef(node: BlockRefNode) {
    return `[[${node.note}#^${node.blockId}]]`
  },
  embedBlock(node: EmbedBlockNode) {
    return `![[${node.note}#^${node.blockId}]]`
  },
  embedInline(node: EmbedInlineNode) {
    return node.blockId ? `![[${node.note}#^${node.blockId}]]` : `![[${node.note}]]`
  }
} as unknown as Options['handlers']

// 固定列表符号与强调符号（- 和 *），保证序列化输出稳定、diff 最小
const serializer = unified()
  .use(remarkStringify, { handlers: customHandlers, bullet: '-', emphasis: '*', strong: '*' })
  .use(remarkGfm)
  .use(remarkMath)

// 把 TipTap 的扁平 marks 还原为 mdast 嵌套格式节点（逐层包裹）；
// code mark 特殊：不能包裹，需把每个 text 就地转成 inlineCode。
function marks(nodes: PhrasingContent[], markList: Mark[]): PhrasingContent[] {
  if (markList.length === 0) return nodes
  let current: PhrasingContent[] = nodes
  for (const mark of markList) {
    if (mark.type === 'bold') {
      current = [{ type: 'strong', children: current }]
    } else if (mark.type === 'italic') {
      current = [{ type: 'emphasis', children: current }]
    } else if (mark.type === 'strike') {
      current = [{ type: 'delete', children: current }]
    } else if (mark.type === 'code') {
      current = current.map((node) =>
        node.type === 'text' ? ({ type: 'inlineCode', value: node.value } as PhrasingContent) : node
      )
    } else if (mark.type === 'link') {
      const attrs = (mark.attrs ?? {}) as { href?: string; target?: string | null }
      current = [
        {
          type: 'link',
          url: attrs.href ?? '',
          title: attrs.target ?? null,
          children: current
        }
      ]
    }
  }
  return current
}

// 行内节点 → mdast；wiki/公式/嵌入是 mdast 不认识的自定义类型，
// 用 as never 塞入，最终由上面的 customHandlers 负责输出
function phrase(content: JSONContent[] | undefined): PhrasingContent[] {
  const result: PhrasingContent[] = []
  for (const node of content ?? []) {
    switch (node.type) {
      case 'text':
        result.push({ type: 'text', value: node.text ?? '' })
        break
      case 'hardBreak':
        result.push({ type: 'break' })
        break
      case 'wikiLink':
        result.push({ type: 'wikiLink', target: String(node.attrs?.target ?? '') } as never)
        break
      case 'blockRef':
        result.push({
          type: 'blockRef',
          note: String(node.attrs?.note ?? ''),
          blockId: String(node.attrs?.blockId ?? '')
        } as never)
        break
      case 'mathInline':
        result.push({ type: 'inlineMath', value: String(node.attrs?.latex ?? '') } as never)
        break
      case 'embedInline':
        result.push({
          type: 'embedInline',
          note: String(node.attrs?.note ?? ''),
          blockId: String(node.attrs?.blockId ?? '')
        } as never)
        break
      case 'markdownImage':
        result.push({
          type: 'image',
          url: String(node.attrs?.src ?? ''),
          alt: String(node.attrs?.alt ?? ''),
          title: node.attrs?.title ? String(node.attrs.title) : null
        })
        break
      default:
        if (node.type === 'text') result.push({ type: 'text', value: node.text ?? '' })
    }
  }
  return result
}

// 文本节点需应用其 marks，其余行内节点直接映射
function phraseWithMarks(content: JSONContent[] | undefined): PhrasingContent[] {
  const result: PhrasingContent[] = []
  for (const node of content ?? []) {
    if (node.type === 'text') {
      result.push(...marks([{ type: 'text', value: node.text ?? '' }], node.marks ?? []))
      continue
    }
    result.push(...phrase([node]))
  }
  return result
}

// 三种列表统一映射为 mdast list；任务项通过 checked 布尔值表达（普通项为 null）
function listBlock(node: JSONContent): List {
  const task = node.type === 'taskList'
  const items: ListItem[] = (node.content ?? []).map((item) => {
    const checked = task ? Boolean(item.attrs?.checked) : undefined
    const children = blocks(item.content ?? [])
    return {
      type: 'listItem',
      checked: checked ?? null,
      spread: false,
      children: children as ListItem['children']
    }
  })
  return {
    type: 'list',
    ordered: node.type === 'orderedList',
    start: node.type === 'orderedList' ? Number(node.attrs?.start ?? 1) : null,
    spread: false,
    children: items
  }
}

// 表格：从首行各单元格的 align 属性还原 GFM 对齐行；单元格只取第一个段落的行内内容
function tableBlock(node: JSONContent): Table {
  const rows = node.content ?? []
  const headerCells = rows[0]?.content ?? []
  const align = headerCells.map((cell) => {
    const value = cell.attrs?.align
    return value === 'left' || value === 'right' || value === 'center' ? value : null
  })
  const tableRows: TableRow[] = rows.map((row) => ({
    type: 'tableRow',
    children: (row.content ?? []).map((cell) => ({
      type: 'tableCell',
      children: phraseWithMarks((cell.content?.[0]?.content ?? []) as JSONContent[])
    })) as TableCell[]
  }))
  return { type: 'table', align, children: tableRows }
}

// 块级节点 → mdast；未知类型保底降级为段落，避免内容丢失
function blocks(content: JSONContent[]): RootContent[] {
  const result: RootContent[] = []
  for (const node of content) {
    switch (node.type) {
      case 'paragraph':
        result.push({ type: 'paragraph', children: phraseWithMarks(node.content) } as Paragraph)
        break
      case 'heading':
        result.push({
          type: 'heading',
          depth: Number(node.attrs?.level ?? 1) as Heading['depth'],
          children: phraseWithMarks(node.content)
        } as Heading)
        break
      case 'blockquote': {
        const quote: Blockquote = {
          type: 'blockquote',
          children: blocks(node.content ?? []) as Blockquote['children']
        }
        result.push(quote)
        break
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        result.push(listBlock(node))
        break
      case 'codeBlock':
        result.push({
          type: 'code',
          lang: node.attrs?.language ? String(node.attrs.language) : null,
          meta: null,
          value: String(node.attrs?.code ?? '')
        } as Code)
        break
      case 'mathBlock':
        result.push({ type: 'math', value: String(node.attrs?.latex ?? '') } as never)
        break
      case 'horizontalRule':
        result.push({ type: 'thematicBreak' })
        break
      case 'htmlBlock':
        result.push({ type: 'html', value: String(node.attrs?.value ?? '') })
        break
      case 'embedBlock':
        result.push({
          type: 'embedBlock',
          note: String(node.attrs?.note ?? ''),
          blockId: String(node.attrs?.blockId ?? '')
        } as never)
        break
      case 'table':
        result.push(tableBlock(node))
        break
      default:
        result.push({
          type: 'paragraph',
          children: phraseWithMarks(node.content)
        } as Paragraph)
    }
  }
  return result
}

const FENCE_LINE = /^(\s*)(`{3,}|~{3,})/

/**
 * remark-stringify 会把行首的 `#` 转义成 `\#`（即使后面没有空格），
 * 但标签解析器与磁盘格式要求 `#tag` 的原始写法，因此在围栏代码块之外
 * 把 `\#` 还原为 `#`；代码块内保持原样，且需匹配同种围栏字符才视为闭合。
 */
function unescapeTagHashes(markdown: string): string {
  let fenced = false
  let fenceChar = ''
  return markdown
    .split('\n')
    .map((line) => {
      const fence = line.match(FENCE_LINE)
      if (fence) {
        const char = fence[2]?.[0] ?? '`'
        if (!fenced) {
          fenced = true
          fenceChar = char
        } else if (char === fenceChar) {
          fenced = false
        }
        return line
      }
      if (fenced) return line
      return line.replace(/\\#(?=[\p{L}\p{N}_/-])/gu, '#')
    })
    .join('\n')
}

// 出口：doc JSON → Markdown 文本；frontmatter 不经过序列化，直接拼回正文之前
export function documentToMarkdown(doc: JSONContent, frontmatter = ''): string {
  const root: Root = { type: 'root', children: blocks(doc.content ?? []) }
  const body = unescapeTagHashes(serializer.stringify(root))
  return frontmatter ? `${frontmatter}${body}` : body
}

// 提取纯文本用于字数统计：跳过代码块与公式（不算正文文字）
export function extractPlainText(doc: JSONContent): string {
  const parts: string[] = []
  const walk = (node: JSONContent, skip: boolean): void => {
    const skipChildren = skip || node.type === 'codeBlock' || node.type === 'mathBlock'
    if (!skipChildren && node.type === 'text' && node.text) parts.push(node.text)
    if (node.type === 'mathInline' || node.type === 'mathBlock') return
    if (node.type === 'codeBlock') return
    for (const child of node.content ?? []) walk(child, skipChildren)
  }
  walk(doc, false)
  return parts.join(' ')
}

export function extractHeadings(doc: JSONContent): { level: number; text: string }[] {
  const result: { level: number; text: string }[] = []
  for (const node of doc.content ?? []) {
    if (node.type !== 'heading') continue
    const text = (node.content ?? [])
      .map((child) => (child.type === 'text' ? child.text ?? '' : ''))
      .join('')
      .trim()
    result.push({ level: Number(node.attrs?.level ?? 1), text })
  }
  return result
}
