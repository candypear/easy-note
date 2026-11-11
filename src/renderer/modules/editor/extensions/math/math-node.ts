// 数学公式节点：块级（$$）与行内（$...$）两种原子节点，LaTeX 存于 latex 属性，
// 由 KaTeX NodeView 渲染；支持 $$ 与 $...$ 输入规则快捷创建。
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
    // SFC 的 props 在运行时声明，这里断言为 NodeViewProps 以满足渲染器契约
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
    // SFC 的 props 在运行时声明，这里断言为 NodeViewProps 以满足渲染器契约
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
