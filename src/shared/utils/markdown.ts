// Markdown 纯函数解析工具：frontmatter 拆分、轻量分块、wiki 链接/标签提取与标题/标签的批量改写。
// 不依赖完整 Markdown AST，用逐行正则做近似解析，供主进程索引与渲染端共用。
import type { BlockType } from '../contracts/block'
import { normalizeWhitespace, stripInlineMarkdown } from './text'

export interface FrontmatterParts {
  // 含首尾分隔符的完整 frontmatter 段（带末尾换行），改写正文后原样拼回
  prefix: string
  body: string
  // 分隔符之间的原始 YAML 文本；无 frontmatter 时为 null
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
  // 原始匹配文本，含 [[ ]] 与可能的 ! 前缀
  raw: string
  target: string
  // [[标题#^块ID]] 中的块 ID；普通链接为 null
  blockId: string | null
  // ![[...]] 为嵌入（embed）
  embed: boolean
  // 在输入文本中的字符偏移区间 [start, end)，供精确替换
  start: number
  end: number
}

// 拆分 YAML frontmatter：仅当首行是 --- 且后续存在闭合行（--- 或 ...）时才认定为 frontmatter，
// 否则整体视为正文（避免把正文里的分隔线误判为头部）。
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

// 各类块起始行的识别正则
// 代码围栏：``` 或 ~~~（至少 3 个），捕获缩进、围栏符与语言标识
const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)?.*$/
const HEADING = /^(#{1,6})\s+(.*)$/
// 分隔线：至少 3 个 * - _，允许夹杂空格，最多 3 个前导空格（CommonMark 规则）
const THEMATIC = /^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/
const QUOTE = /^\s{0,3}>/
const LIST_ITEM = /^(\s*)([-*+]|\d+\.)\s+(.*)$/
// 任务项：无序标记后跟 [ ] / [x] / [X]
const TASK_ITEM = /^\s*[-*+]\s+\[[ xX]\]\s+/
const MATH_FENCE = /^\s*\$\$/

function isFenceStart(line: string): RegExpMatchArray | null {
  return line.match(FENCE)
}

// 表格判定需看两行：当前行含 |，下一行是由 :?-+:? 组成的对齐分隔行
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

// 判断某行是否开启新块，用于段落合并时的终止条件；末项匹配独占一行的 HTML 标签
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

// 去掉列表/任务标记，只留内容文本
function stripListMarker(line: string): string {
  return line
    .replace(/^\s*([-*+]|\d+\.)\s+/, '')
    .replace(/^\[[ xX]\]\s+/, '')
    .trim()
}

// 从 start 行解析出一个块，返回块与下一待解析行号。
// bodyOffset 为正文在完整文件中的起始行偏移，保证行号相对整个文件（1 起）。
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
      // 闭合围栏必须与开启符同字符且不短于开启长度（CommonMark 规则）；未闭合则吞到文末
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
    // 形如 $$...$$ 的单行公式；否则逐行找行尾 $$ 作为闭合，未闭合则吞到文末
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
    // 后续含 | 的行都算表格行，遇到不含 | 的行即结束
    while (end + 1 < lines.length && (lines[end + 1] ?? '').includes('|')) end += 1
    const tableLines = lines.slice(start, end + 1)
    // 提取纯文本时跳过第 2 行（对齐分隔行），单元格内容以空格连接
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
    // 连续的 > 行合并为一个引用块（懒延续行不支持，简化处理）
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
    // 首行是任务项则整个列表归为 task 类型
    const task = TASK_ITEM.test(line)
    let end = start
    while (end + 1 < lines.length) {
      const next = lines[end + 1] ?? ''
      if (next.trim() === '') break
      // 列表项行或缩进 ≥2 空格的续行（子项/悬挂缩进）并入同一列表块；空行即结束
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

  // 兜底：普通段落，合并连续非空行直到空行或新块开始
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

// 把 Markdown 拆成有序块列表：先剥离 frontmatter，再跳过空行逐块解析；
// ordinal 按解析顺序编号，plainText 汇总供全文索引用。
export function parseMarkdownBlocks(markdown: string): ParsedMarkdown {
  const { raw, body } = splitFrontmatter(markdown)
  // 用总行数减正文行数推算 frontmatter 占的行数，保证块行号相对完整文件
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

// 提取 wiki 链接：匹配 [[目标]] / [[目标#^块ID]] / ![[...]]（嵌入）。
// 目标不允许含 [ ] 与换行，避免跨行或嵌套括号误匹配；目标为空的匹配直接丢弃。
export function extractWikiLinks(text: string): WikiLinkRef[] {
  const pattern = /!?\[\[([^[\]\n]+?)\]\]/g
  const links: WikiLinkRef[] = []
  for (const match of text.matchAll(pattern)) {
    const raw = match[0] ?? ''
    const content = (match[1] ?? '').trim()
    // 以首个 #^ 分隔标题与块 ID；块 ID 为空串时归一为 null
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

// 从 frontmatter 原文提取 tags/tag 键（aliases 键被识别但不采集）。
// 支持行内写法 tags: a, b / [a, b] 与 YAML 列表写法（tags: 换行后跟 - 项）。
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
        // 行内列表：去掉两端方括号后按逗号拆分
        const list = rest.replace(/^\[/, '').replace(/\]$/, '')
        tags.push(...list.split(',').map(cleanTagValue).filter(Boolean))
        collecting = false
      } else {
        // 值为空说明是 YAML 列表写法，进入逐行收集 "- 项" 的状态
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
      // 遇到非列表项的非空行即结束收集（空行容忍）
      if (line.trim() !== '') collecting = false
    }
  }
  return tags.filter((tag) => tag.length > 0)
}

// 清洗单个标签值：去两端引号与前导 #
function cleanTagValue(value: string): string {
  return value
    .trim()
    .replace(/^['"]/, '')
    .replace(/['"]$/, '')
    .replace(/^#/, '')
}

// 提取正文内联 #标签：先剔除代码围栏与行内代码、再剥离 frontmatter，避免把代码/头部里的 # 误判为标签。
export function extractInlineTags(markdown: string): string[] {
  const withoutCode = markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/`[^`\n]*`/g, '')
  const { body } = splitFrontmatter(withoutCode)
  // # 必须位于行首或空白/>([{ 之后（排除 URL 锚点等）；标签体允许 Unicode 字母数字及 _/-（支持嵌套标签）
  const pattern = /(^|[\s>([{])#([\p{L}\p{N}_/-]+)/gu
  const tags: string[] = []
  for (const match of body.matchAll(pattern)) {
    const value = match[2]?.trim() ?? ''
    if (value) tags.push(value)
  }
  return tags
}

// 汇总 frontmatter 与内联标签并去重
export function extractTags(markdown: string): string[] {
  const { raw } = splitFrontmatter(markdown)
  return [...new Set([...parseFrontmatterTags(raw), ...extractInlineTags(markdown)])]
}

// 笔记重命名后，把指向旧标题的 wiki 链接目标改写为新标题（保留 #^块ID 后缀）。
// 逐行跟踪代码围栏状态，围栏内不改写，避免误改代码示例。
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
          // 仅同字符围栏才视为闭合，防止 ``` 块内出现 ~~~ 提前退出
          fenced = false
        }
        return line
      }
      if (fenced) return line
      return line.replace(/!?\[\[([^[\]\n]+?)\]\]/g, (raw, content: string) => {
        const separator = content.indexOf('#^')
        const target = (separator >= 0 ? content.slice(0, separator) : content).trim()
        // 目标须与旧标题完全一致才替换
        if (target !== oldTitle) return raw
        return raw.replace(content, `${newTitle}${separator >= 0 ? content.slice(separator) : ''}`)
      })
    })
    .join('\n')
}

// 把不应算作"未链接提及"的区域（代码围栏、wiki 链接、行内代码）替换成等长空格，
// 保持字符偏移不变，使后续 indexOf 得到的位置仍能对应原文。
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

// 在屏蔽非提及区域后的文本中查找标题第 occurrence 次（0 起）出现的字符偏移；找不到返回 -1。
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

// 生成命中词前后各 radius 字符的上下文摘录，两端截断处补省略号；未命中则取开头片段。
export function makeContext(text: string, needle: string, radius = 48): string {
  const index = text.indexOf(needle)
  if (index === -1) return normalizeWhitespace(text).slice(0, radius * 2)
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + needle.length + radius)
  return `${start > 0 ? '…' : ''}${normalizeWhitespace(text.slice(start, end))}${
    end < text.length ? '…' : ''
  }`
}

// 替换单行内的 #标签：前缀限定 + 尾部负向断言保证整词匹配（#foo 不会命中 #foobar）；
// newName 为 null 表示删除该标签。
const replaceTagInLine = (line: string, oldName: string, newName: string | null): string => {
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `(^|[\\s>([{,])#${escaped}(?![\\p{L}\\p{N}_/-])`,
    'gu'
  )
  return line.replace(pattern, (_match, prefix: string) => `${prefix}${newName ? `#${newName}` : ''}`)
}

// 全库标签重命名/删除：分别改写 frontmatter 与正文，正文跳过代码围栏。
// newName 为 null 表示删除标签。
export function replaceTagInMarkdown(
  markdown: string,
  oldName: string,
  newName: string | null
): string {
  const { prefix, body } = splitFrontmatter(markdown)
  const frontmatter = prefix
    .split(/\r?\n/)
    .map((line) => {
      // 只处理 tags/aliases 键行与 YAML 列表项行，其余头部字段不动
      if (!/^\s*(tags?|aliases)\s*:/i.test(line) && !/^\s*-\s+/.test(line)) return line
      const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (newName === null) {
        // 删除：依次处理行内列表中间项（连同前置逗号）、首项、独占一行的列表项
        return line
          .replace(new RegExp(`,\\s*${escaped}(?=\\s*[,\\]])`, 'g'), '')
          .replace(new RegExp(`(^|\\[)\\s*${escaped}\\s*(?=,|\\])`, 'g'), '$1')
          .replace(new RegExp(`^\\s*-\\s*${escaped}\\s*$`, 'g'), '')
      }
      // 重命名：按整词边界替换，兼容行内列表与 YAML 列表两种写法
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

