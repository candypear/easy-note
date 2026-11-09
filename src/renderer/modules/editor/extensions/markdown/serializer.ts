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

const serializer = unified()
  .use(remarkStringify, { handlers: customHandlers, bullet: '-', emphasis: '*', strong: '*' })
  .use(remarkGfm)
  .use(remarkMath)

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
 * remark-stringify escapes a line-leading `#` even when it is not followed by
 * a space, turning `#tag` into `\#tag`. The tag parser (and the on-disk format)
 * expect the plain form, so restore it outside fenced code blocks.
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

export function documentToMarkdown(doc: JSONContent, frontmatter = ''): string {
  const root: Root = { type: 'root', children: blocks(doc.content ?? []) }
  const body = unescapeTagHashes(serializer.stringify(root))
  return frontmatter ? `${frontmatter}${body}` : body
}

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
