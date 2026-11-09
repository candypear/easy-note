import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer, type NodeViewProps } from '@tiptap/vue-3'
import type { Component } from 'vue'
import HtmlBlockView from './HtmlBlockView.vue'

export const HtmlBlock = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      value: { default: '', parseHTML: (element: HTMLElement) => element.textContent ?? '' }
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-html-block]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-html-block': '' })]
  },
  addNodeView() {
    // SFC props are declared at runtime; the renderer contract is NodeViewProps.
    return VueNodeViewRenderer(HtmlBlockView as Component<NodeViewProps>)
  }
})
