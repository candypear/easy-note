import { InputRule, Node, mergeAttributes, nodeInputRule } from '@tiptap/core'
import { VueNodeViewRenderer, type NodeViewProps } from '@tiptap/vue-3'
import type { Component } from 'vue'
import MathBlockView from './MathBlockView.vue'
import MathInlineView from './MathInlineView.vue'

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      latex: { default: '', parseHTML: (element: HTMLElement) => element.getAttribute('data-latex') ?? '' }
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-math-block]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-math-block': '' })]
  },
  addNodeView() {
    // SFC props are declared at runtime; the renderer contract is NodeViewProps.
    return VueNodeViewRenderer(MathBlockView as Component<NodeViewProps>)
  },
  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$$/,
        handler: ({ state, range }) => {
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex: '' }))
        }
      })
    ]
  }
})

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      latex: { default: '', parseHTML: (element: HTMLElement) => element.getAttribute('data-latex') ?? '' }
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-math-inline]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-math-inline': '' })]
  },
  addNodeView() {
    // SFC props are declared at runtime; the renderer contract is NodeViewProps.
    return VueNodeViewRenderer(MathInlineView as Component<NodeViewProps>)
  },
  addInputRules() {
    return [
      nodeInputRule({
        find: /\$([^$\n]+)\$$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] ?? '' })
      })
    ]
  }
})
