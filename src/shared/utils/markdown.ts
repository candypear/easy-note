import type { BlockType } from '../contracts/block'
import { normalizeWhitespace, stripInlineMarkdown } from './text'

export interface FrontmatterParts {
  prefix: string
  body: string
  raw: string | null
}

export interface ParsedBlock {
  ordinal: number
  type: BlockType
  plainText: string
  markdown: string
  startLine: number
  endLine: number
  headingLevel: number | null
  codeLang: string | null
}

export interface ParsedMarkdown {
  frontmatter: string | null
  body: string
  blocks: ParsedBlock[]
  plainText: string
}

export interface WikiLinkRef {
  raw: string
  target: string
  blockId: string | null
  embed: boolean
  start: number
  end: number
}

export function splitFrontmatter(markdown: string): FrontmatterParts {
  const lines = markdown.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return { prefix: '', body: markdown, raw: null }
  }
  const closing = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line))
  if (closing === -1) {
    return { prefix: '', body: markdown, raw: null }
  }
  const raw = lines.slice(1, closing).join('\n')
  const prefix = `${lines.slice(0, closing + 1).join('\n')}\n`
  return { prefix, body: lines.slice(closing + 1).join('\n'), raw }
}

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)?.*$/
const HEADING = /^(#{1,6})\s+(.*)$/
const THEMATIC = /^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/
const QUOTE = /^\s{0,3}>/
const LIST_ITEM = /^(\s*)([-*+]|\d+\.)\s+(.*)$/
const TASK_ITEM = /^\s*[-*+]\s+\[[ xX]\]\s+/
const MATH_FENCE = /^\s*\$\$/

function isFenceStart(line: string): RegExpMatchArray | null {
  return line.match(FENCE)
}

function isTableStart(lines: string[], index: number): boolean {
  const current = lines[index]
  const next = lines[index + 1]
  if (!current?.includes('|') || !next || !next.includes('-')) return false
  const cells = next
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell))
}

function isMathStart(line: string): boolean {
  if (!MATH_FENCE.test(line)) return false
  const trimmed = line.trim()
  return trimmed.startsWith('$$')
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index]
  if (!line) return false
  return (
    isFenceStart(line) !== null ||
    isMathStart(line) ||
    HEADING.test(line) ||
    THEMATIC.test(line) ||
    QUOTE.test(line) ||
    LIST_ITEM.test(line) ||
    isTableStart(lines, index) ||
    /^\s*<[^>]+>\s*$/.test(line)
  )
}

function stripListMarker(line: string): string {
  return line
    .replace(/^\s*([-*+]|\d+\.)\s+/, '')
    .replace(/^\[[ xX]\]\s+/, '')
    .trim()
}

function parseBlock(lines: string[], start: number, bodyOffset: number): { block: ParsedBlock; next: number } {
  const line = lines[start] ?? ''
  const startLine = bodyOffset + start + 1

  const fence = isFenceStart(line)
  if (fence) {
    const fenceChar = fence[2]?.[0] ?? '`'
    const fenceLength = fence[2]?.length ?? 3
    const info = (fence[3] ?? '').trim()
    const content: string[] = []
    let index = start + 1
    for (; index < lines.length; index += 1) {
      const candidate = lines[index] ?? ''
      const close = candidate.match(/^\s*(`{3,}|~{3,})\s*$/)
      if (close && close[1]?.[0] === fenceChar && (close[1]?.length ?? 0) >= fenceLength) break
      content.push(candidate)
    }
    const end = Math.min(index, lines.length - 1)
    const markdown = lines.slice(start, end + 1).join('\n')
    return {
      block: {
        ordinal: 0,
        type: 'code',
        plainText: content.join('\n'),
        markdown,
        startLine,
        endLine: bodyOffset + end + 1,
        headingLevel: null,
        codeLang: info || null
      },
      next: end + 1
    }
  }

  if (isMathStart(line)) {
    const trimmed = line.trim()
    const inline = trimmed.length > 4 && trimmed.endsWith('$$')
    const content: string[] = []
    let end = start
    if (inline) {
      content.push(trimmed.slice(2, -2).trim())
    } else {
      const first = trimmed.slice(2).trim()
      if (first) content.push(first)
      let index = start + 1
      for (; index < lines.length; index += 1) {
        const candidate = lines[index] ?? ''
        if (/\$\$\s*$/.test(candidate)) {
          const inner = candidate.replace(/\$\$\s*$/, '').trim()
          if (inner) content.push(inner)
          end = index
          break
        }
        content.push(candidate)
      }
      if (index >= lines.length) end = lines.length - 1
    }
    return {
      block: {
        ordinal: 0,
        type: 'math',
        plainText: content.join('\n').trim(),
        markdown: lines.slice(start, end + 1).join('\n'),
        startLine,
        endLine: bodyOffset + end + 1,
        headingLevel: null,
        codeLang: null
      },
      next: end + 1
    }
  }

  const heading = line.match(HEADING)
  if (heading) {
    return {
      block: {
        ordinal: 0,
        type: 'heading',
        plainText: stripInlineMarkdown(heading[2] ?? ''),
        markdown: line,
        startLine,
        endLine: startLine,
        headingLevel: heading[1]?.length ?? 1,
        codeLang: null
      },
      next: start + 1
    }
  }

  if (THEMATIC.test(line)) {
    return {
      block: {
        ordinal: 0,
        type: 'hr',
        plainText: '',
        markdown: line,
        startLine,
        endLine: startLine,
        headingLevel: null,
        codeLang: null
      },
      next: start + 1
    }
  }

  if (isTableStart(lines, start)) {
    let end = start + 1
    while (end + 1 < lines.length && (lines[end + 1] ?? '').includes('|')) end += 1
    const tableLines = lines.slice(start, end + 1)
    const plainText = tableLines
      .filter((_row, index) => index !== 1)
      .map((row) =>
        row
          .replace(/^\s*\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => stripInlineMarkdown(cell))
          .join(' ')
      )
      .join('\n')
    return {
      block: {
        ordinal: 0,
        type: 'table',
        plainText: normalizeWhitespace(plainText),
        markdown: tableLines.join('\n'),
        startLine,
        endLine: bodyOffset + end + 1,
        headingLevel: null,
        codeLang: null
      },
      next: end + 1
    }
  }

  if (QUOTE.test(line)) {
    let end = start
    while (end + 1 < lines.length && QUOTE.test(lines[end + 1] ?? '')) end += 1
    const quoteLines = lines.slice(start, end + 1)
    const plainText = normalizeWhitespace(
      stripInlineMarkdown(quoteLines.map((row) => row.replace(/^\s{0,3}>\s?/, '')).join(' '))
    )
    return {
      block: {
        ordinal: 0,
        type: 'quote',
        plainText,
        markdown: quoteLines.join('\n'),
        startLine,
        endLine: bodyOffset + end + 1,
        headingLevel: null,
        codeLang: null
      },
      next: end + 1
    }
  }

  if (LIST_ITEM.test(line)) {
    const task = TASK_ITEM.test(line)
    let end = start
    while (end + 1 < lines.length) {
      const next = lines[end + 1] ?? ''
      if (next.trim() === '') break
      if (LIST_ITEM.test(next) || /^\s{2,}\S/.test(next)) {
        end += 1
        continue
      }
      break
    }
    const listLines = lines.slice(start, end + 1)
    const plainText = normalizeWhitespace(
      stripInlineMarkdown(listLines.map((row) => stripListMarker(row)).join('\n'))
    )
    return {
      block: {
        ordinal: 0,
        type: task ? 'task' : 'list',
        plainText,
        markdown: listLines.join('\n'),
        startLine,
        endLine: bodyOffset + end + 1,
        headingLevel: null,
        codeLang: null
      },
      next: end + 1
    }
  }

  let end = start
  while (end + 1 < lines.length) {
    const next = lines[end + 1] ?? ''
    if (next.trim() === '' || isBlockStart(lines, end + 1)) break
    end += 1
  }
  const paragraphLines = lines.slice(start, end + 1)
  return {
    block: {
      ordinal: 0,
      type: 'paragraph',
      plainText: stripInlineMarkdown(paragraphLines.join(' ')),
      markdown: paragraphLines.join('\n'),
      startLine,
      endLine: bodyOffset + end + 1,
      headingLevel: null,
      codeLang: null
    },
    next: end + 1
  }
}

export function parseMarkdownBlocks(markdown: string): ParsedMarkdown {
  const { raw, body } = splitFrontmatter(markdown)
  const bodyStart = raw === null ? 0 : markdown.split(/\r?\n/).length - body.split(/\r?\n/).length
  const lines = body.split(/\r?\n/)
  const blocks: ParsedBlock[] = []
  let index = 0
  while (index < lines.length) {
    if ((lines[index] ?? '').trim() === '') {
      index += 1
      continue
    }
    const { block, next } = parseBlock(lines, index, bodyStart)
    block.ordinal = blocks.length
    blocks.push(block)
    index = next
  }
  return {
    frontmatter: raw,
    body,
    blocks,
    plainText: blocks.map((block) => block.plainText).join('\n')
  }
}

export function extractWikiLinks(text: string): WikiLinkRef[] {
  const pattern = /!?\[\[([^[\]\n]+?)\]\]/g
  const links: WikiLinkRef[] = []
  for (const match of text.matchAll(pattern)) {
    const raw = match[0] ?? ''
    const content = (match[1] ?? '').trim()
    const separator = content.indexOf('#^')
    const target = (separator >= 0 ? content.slice(0, separator) : content).trim()
    const blockId = separator >= 0 ? content.slice(separator + 2).trim() || null : null
    if (!target) continue
    links.push({
      raw,
      target,
      blockId,
      embed: raw.startsWith('!'),
      start: match.index ?? 0,
      end: (match.index ?? 0) + raw.length
    })
  }
  return links
}

export function parseFrontmatterTags(raw: string | null): string[] {
  if (!raw) return []
  const tags: string[] = []
  const lines = raw.split(/\r?\n/)
  let collecting = false
  for (const line of lines) {
    const key = line.match(/^\s*(tags?|aliases)\s*:\s*(.*)$/i)
    if (key && (key[1] ?? '').toLowerCase().startsWith('tag')) {
      const rest = (key[2] ?? '').trim()
      if (rest) {
        const list = rest.replace(/^\[/, '').replace(/\]$/, '')
        tags.push(...list.split(',').map(cleanTagValue).filter(Boolean))
        collecting = false
      } else {
        collecting = true
      }
      continue
    }
    if (collecting) {
      const item = line.match(/^\s*-\s*(.+)$/)
      if (item) {
        tags.push(cleanTagValue(item[1] ?? ''))
        continue
      }
      if (line.trim() !== '') collecting = false
    }
  }
  return tags.filter((tag) => tag.length > 0)
}

function cleanTagValue(value: string): string {
  return value
    .trim()
    .replace(/^['"]/, '')
    .replace(/['"]$/, '')
    .replace(/^#/, '')
}

export function extractInlineTags(markdown: string): string[] {
  const withoutCode = markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/`[^`\n]*`/g, '')
  const { body } = splitFrontmatter(withoutCode)
  const pattern = /(^|[\s>([{])#([\p{L}\p{N}_/-]+)/gu
  const tags: string[] = []
  for (const match of body.matchAll(pattern)) {
    const value = match[2]?.trim() ?? ''
    if (value) tags.push(value)
  }
  return tags
}

export function extractTags(markdown: string): string[] {
  const { raw } = splitFrontmatter(markdown)
  return [...new Set([...parseFrontmatterTags(raw), ...extractInlineTags(markdown)])]
}

export function replaceWikiTargets(markdown: string, oldTitle: string, newTitle: string): string {
  const lines = markdown.split(/\r?\n/)
  let fenced = false
  let fenceChar = ''
  return lines
    .map((line) => {
      const fence = isFenceStart(line)
      if (fence) {
        if (!fenced) {
          fenced = true
          fenceChar = fence[2]?.[0] ?? '`'
        } else if ((fence[2]?.[0] ?? '') === fenceChar) {
          fenced = false
        }
        return line
      }
      if (fenced) return line
      return line.replace(/!?\[\[([^[\]\n]+?)\]\]/g, (raw, content: string) => {
        const separator = content.indexOf('#^')
        const target = (separator >= 0 ? content.slice(0, separator) : content).trim()
        if (target !== oldTitle) return raw
        return raw.replace(content, `${newTitle}${separator >= 0 ? content.slice(separator) : ''}`)
      })
    })
    .join('\n')
}

function maskNonMentionRanges(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  let fenced = false
  let fenceChar = ''
  return lines
    .map((line) => {
      const fence = isFenceStart(line)
      if (fence) {
        if (!fenced) {
          fenced = true
          fenceChar = fence[2]?.[0] ?? '`'
        } else if ((fence[2]?.[0] ?? '') === fenceChar) {
          fenced = false
        }
        return ' '.repeat(line.length)
      }
      if (fenced) return ' '.repeat(line.length)
      return line
        .replace(/!?\[\[[^[\]\n]*\]\]/g, (raw) => ' '.repeat(raw.length))
        .replace(/`[^`\n]*`/g, (raw) => ' '.repeat(raw.length))
    })
    .join('\n')
}

export function findMentionIndex(markdown: string, title: string, occurrence = 0): number {
  if (!title) return -1
  const masked = maskNonMentionRanges(markdown)
  let index = -1
  let from = 0
  for (let count = 0; count <= occurrence; count += 1) {
    index = masked.indexOf(title, from)
    if (index === -1) return -1
    from = index + title.length
  }
  return index
}

export function makeContext(text: string, needle: string, radius = 48): string {
  const index = text.indexOf(needle)
  if (index === -1) return normalizeWhitespace(text).slice(0, radius * 2)
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + needle.length + radius)
  return `${start > 0 ? '…' : ''}${normalizeWhitespace(text.slice(start, end))}${
    end < text.length ? '…' : ''
  }`
}

const replaceTagInLine = (line: string, oldName: string, newName: string | null): string => {
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `(^|[\\s>([{,])#${escaped}(?![\\p{L}\\p{N}_/-])`,
    'gu'
  )
  return line.replace(pattern, (_match, prefix: string) => `${prefix}${newName ? `#${newName}` : ''}`)
}

export function replaceTagInMarkdown(
  markdown: string,
  oldName: string,
  newName: string | null
): string {
  const { prefix, body } = splitFrontmatter(markdown)
  const frontmatter = prefix
    .split(/\r?\n/)
    .map((line) => {
      if (!/^\s*(tags?|aliases)\s*:/i.test(line) && !/^\s*-\s+/.test(line)) return line
      const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (newName === null) {
        return line
          .replace(new RegExp(`,\\s*${escaped}(?=\\s*[,\\]])`, 'g'), '')
          .replace(new RegExp(`(^|\\[)\\s*${escaped}\\s*(?=,|\\])`, 'g'), '$1')
          .replace(new RegExp(`^\\s*-\\s*${escaped}\\s*$`, 'g'), '')
      }
      return line.replace(new RegExp(`(^|[\\s,\\[-])${escaped}(?=$|[\\s,\\]])`, 'g'), `$1${newName}`)
    })
    .join('\n')

  const lines = body.split(/\r?\n/)
  let fenced = false
  let fenceChar = ''
  const replaced = lines.map((line) => {
    const fence = line.match(/^(\s*)(`{3,}|~{3,})/)
    if (fence) {
      if (!fenced) {
        fenced = true
        fenceChar = fence[2]?.[0] ?? '`'
      } else if ((fence[2]?.[0] ?? '') === fenceChar) {
        fenced = false
      }
      return line
    }
    if (fenced) return line
    return replaceTagInLine(line, oldName, newName)
  })
  const result = replaced.join('\n')
  return `${frontmatter}${result}`
}

