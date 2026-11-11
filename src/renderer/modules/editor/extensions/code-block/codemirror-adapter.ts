import { HighlightStyle, bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, rectangularSelection } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { codeExtensions, codeKeymap, languageExtension } from './languages'

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--code-keyword)' },
  { tag: tags.string, color: 'var(--code-string)' },
  { tag: tags.number, color: 'var(--code-number)' },
  { tag: tags.comment, color: 'var(--code-comment)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--code-function)' },
  { tag: [tags.typeName, tags.className], color: 'var(--code-type)' },
  { tag: tags.variableName, color: 'var(--code-variable)' },
  { tag: [tags.punctuation, tags.operator], color: 'var(--code-punctuation)' }
])

export interface CodeEditorOptions {
  value: string
  language: string | null
  onChange(value: string): void
  lineNumbers?: boolean
  readOnly?: boolean
  onEscape?(): void
}

export interface CodeEditorHandle {
  view: EditorView
  setValue(value: string): void
  setLanguage(language: string | null): void
  destroy(): void
}

export function createCodeEditor(parent: HTMLElement, options: CodeEditorOptions): CodeEditorHandle {
  let language = options.language

  const theme = EditorView.theme({
    '&': { height: '100%', fontSize: '12.5px', backgroundColor: 'transparent' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.7', overflow: 'auto' },
    '.cm-content': { padding: '8px 0', caretColor: 'var(--text-primary)' },
    '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--text-tertiary)' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 0', minWidth: '24px' },
    '.cm-activeLine': { backgroundColor: 'var(--bg-hover)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '&.cm-focused': { outline: 'none' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'var(--bg-selected)'
    },
    '.cm-cursor': { borderLeftColor: 'var(--text-primary)' }
  })

  const build = (): Extension[] => {
    const extensions: Extension[] = [
      ...codeExtensions,
      codeKeymap.length > 0 ? keymap.of([...codeKeymap]) : [],
      theme,
      syntaxHighlighting(highlight),
      bracketMatching(),
      indentOnInput(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      EditorView.contentAttributes.of({ spellcheck: 'false' }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) options.onChange(update.state.doc.toString())
      })
    ]
    if (options.lineNumbers !== false) {
      extensions.push(lineNumbers(), highlightActiveLineGutter(), highlightActiveLine())
    }
    const lang = languageExtension(language)
    if (lang) extensions.push(lang)
    if (options.readOnly) extensions.push(EditorState.readOnly.of(true))
    if (options.onEscape) {
      extensions.push(
        keymap.of([
          {
            key: 'Escape',
            run: () => {
              options.onEscape?.()
              return true
            }
          }
        ])
      )
    }
    return extensions
  }

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: options.value, extensions: build() })
  })

  return {
    view,
    setValue(value) {
      if (value === view.state.doc.toString()) return
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    },
    setLanguage(next) {
      if (next === language) return
      language = next
      const content = view.state.doc.toString()
      view.setState(EditorState.create({ doc: content, extensions: build() }))
    },
    destroy() {
      view.destroy()
    }
  }
}
