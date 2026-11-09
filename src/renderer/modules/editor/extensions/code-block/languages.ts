import type { Extension } from '@codemirror/state'
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { StreamLanguage } from '@codemirror/language'
import { cpp } from '@codemirror/lang-cpp'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import type { KeyBinding } from '@codemirror/view'
import { shell } from '@codemirror/legacy-modes/mode/shell'

export interface LanguageOption {
  id: string
  label: string
}

export const LANGUAGES: LanguageOption[] = [
  { id: 'plaintext', label: 'Plain Text' },
  { id: 'ts', label: 'TypeScript' },
  { id: 'tsx', label: 'TSX' },
  { id: 'js', label: 'JavaScript' },
  { id: 'jsx', label: 'JSX' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'sql', label: 'SQL' },
  { id: 'shell', label: 'Shell' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'latex', label: 'LaTeX' },
  { id: 'mermaid', label: 'Mermaid' }
]

export function languageExtension(language: string | null): Extension | null {
  switch (language) {
    case 'ts':
      return javascript({ typescript: true })
    case 'tsx':
      return javascript({ typescript: true, jsx: true })
    case 'js':
      return javascript()
    case 'jsx':
      return javascript({ jsx: true })
    case 'python':
      return python()
    case 'java':
      return java()
    case 'rust':
      return rust()
    case 'c':
    case 'cpp':
      return cpp()
    case 'sql':
      return sql()
    case 'shell':
      return StreamLanguage.define(shell)
    case 'html':
      return html()
    case 'css':
      return css()
    case 'json':
      return json()
    case 'markdown':
      return markdown()
    default:
      return null
  }
}

export const codeKeymap: KeyBinding[] = [
  ...closeBracketsKeymap,
  ...defaultKeymap,
  ...historyKeymap,
  ...completionKeymap,
  indentWithTab
]

export const codeExtensions: Extension[] = [history(), closeBrackets()]
