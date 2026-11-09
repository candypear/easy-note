import { InputRule, Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer, type NodeViewProps } from '@tiptap/vue-3'
import type { Component } from 'vue'
import CodeBlockView from './CodeBlockView.vue'

export const CodeBlock = Node.create({
  name: 'codeBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      language: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-language')
      },
      code: { default: '', parseHTML: (element: HTMLElement) => element.textContent ?? '' },
      collapsed: { default: false }
    }
  },
  parseHTML() {
    return [{ tag: 'pre[data-code-block]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['pre', mergeAttributes(HTMLAttributes, { 'data-code-block': '' })]
  },
  addNodeView() {
    // SFC props are declared at runtime; the renderer contract is NodeViewProps.
    return VueNodeViewRenderer(CodeBlockView as Component<NodeViewProps>)
  },
  addInputRules() {
    return [
      new InputRule({
        find: /^```([\w+#.-]*)$/,
        handler: ({ state, range, match }) => {
          const language = match[1] ? match[1] : null
          const node = this.type.create({ language, code: '', collapsed: false })
          state.tr.replaceWith(range.from, range.to, node)
        }
      })
    ]
  }
})
