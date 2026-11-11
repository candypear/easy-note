// 原生 HTML 块节点：把 Markdown 中的 HTML 片段作为原子块保存原文，
// 仅以源码形式展示不执行，序列化时原样写回。
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
    // SFC 的 props 在运行时声明，这里断言为 NodeViewProps 以满足渲染器契约
    return VueNodeViewRenderer(HtmlBlockView as Component<NodeViewProps>)
  }
})
