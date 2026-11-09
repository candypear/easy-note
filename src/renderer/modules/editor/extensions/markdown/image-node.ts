import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer, type NodeViewProps } from '@tiptap/vue-3'
import type { Component } from 'vue'
import ImageView from './ImageView.vue'

export const MarkdownImage = Node.create({
  name: 'markdownImage',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      title: { default: null }
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-markdown-image]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-markdown-image': '' })]
  },
  addNodeView() {
    // SFC props are declared at runtime; the renderer contract is NodeViewProps.
    return VueNodeViewRenderer(ImageView as Component<NodeViewProps>)
  }
})
