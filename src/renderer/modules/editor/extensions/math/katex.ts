import katex from 'katex'
import 'katex/dist/katex.min.css'

export interface KatexResult {
  html: string
  error: boolean
}

export function renderKatex(latex: string, displayMode: boolean): KatexResult {
  try {
    return {
      html: katex.renderToString(latex, {
        displayMode,
        throwOnError: true,
        strict: false,
        trust: false
      }),
      error: false
    }
  } catch {
    return {
      html: katex.renderToString(latex.replace(/[\\{}_^]/g, ''), {
        displayMode,
        throwOnError: false,
        strict: false
      }),
      error: true
    }
  }
}
