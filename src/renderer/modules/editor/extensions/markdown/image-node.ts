// Markdown 图片节点：行内原子节点，保存 src/alt/title 保证往返序列化不丢信息；
// 当前版本不渲染真实图片，由 NodeView 显示占位提示。
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
    // SFC 的 props 在运行时声明，这里断言为 NodeViewProps 以满足渲染器契约
    return VueNodeViewRenderer(ImageView as Component<NodeViewProps>)
  }
})
