// KaTeX 渲染封装：LaTeX → HTML，出错时降级为去掉语法字符的纯文本展示而非抛异常。
import katex from 'katex'
import 'katex/dist/katex.min.css'

export interface KatexResult {
  html: string
  error: boolean
}

// trust: false 禁用 \href 等潜在危险命令；渲染失败时剥掉 \{}_^ 再容错渲染，
// 保证编辑中的半成品公式也有可见反馈，error 标记供视图显示错误样式
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
