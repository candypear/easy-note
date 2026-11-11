// 纯文本工具：字数统计、正则转义、空白归一化与内联 Markdown 剥离，供索引与展示共用。
// CJK 字符范围：汉字（含扩展 A、兼容区）、日文假名、韩文音节，按"每字一词"计数
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u
// 西文单词：字母数字串，允许内部以 ' ’ _ - 连接（如 don't、well-known）
const WORD = /[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*/g

export interface WordStats {
  words: number
  characters: number
  readingMinutes: number
}

// 混合字数统计：CJK 每字计 1 词，其余文本按西文单词计；readingSpeed 为每分钟词数
export function countWords(text: string, readingSpeed = 300): WordStats {
  let words = 0
  let characters = 0
  // for...of 按码点迭代，避免代理对（如 emoji）被算成两个字符
  for (const char of text) {
    if (/\s/u.test(char)) continue
    characters += 1
    if (CJK.test(char)) words += 1
  }
  // 先把 CJK 替换为空格再匹配西文单词，避免中英混排时重复计数
  const withoutCjk = text.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/gu, ' ')
  words += withoutCjk.match(WORD)?.length ?? 0
  return {
    words,
    characters,
    readingMinutes: words === 0 ? 0 : Math.ceil(words / readingSpeed)
  }
}

// 转义正则元字符，供把用户输入（标题、标签名）安全拼进 RegExp
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

// 去掉内联 Markdown 标记只留可读文本；顺序有讲究：先图片后链接、先粗体后斜体，防止误吞
export function stripInlineMarkdown(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\$([^$]+)\$/g, '$1')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/<[^>]+>/g, '')
  )
}

// 超长截断并加省略号，结果长度不超过 max
export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}
