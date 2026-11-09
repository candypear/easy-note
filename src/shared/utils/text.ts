const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u
const WORD = /[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*/g

export interface WordStats {
  words: number
  characters: number
  readingMinutes: number
}

export function countWords(text: string, readingSpeed = 300): WordStats {
  let words = 0
  let characters = 0
  for (const char of text) {
    if (/\s/u.test(char)) continue
    characters += 1
    if (CJK.test(char)) words += 1
  }
  const withoutCjk = text.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/gu, ' ')
  words += withoutCjk.match(WORD)?.length ?? 0
  return {
    words,
    characters,
    readingMinutes: words === 0 ? 0 : Math.ceil(words / readingSpeed)
  }
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

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

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}
