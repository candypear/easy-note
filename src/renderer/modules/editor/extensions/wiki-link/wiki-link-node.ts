import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer, type NodeViewProps } from '@tiptap/vue-3'
import type { Component } from 'vue'
import WikiLinkView from './WikiLinkView.vue'
import BlockRefView from './BlockRefView.vue'
import EmbedBlockView from './EmbedBlockView.vue'
import EmbedInlineView from './EmbedInlineView.vue'

const inlineBase = {
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true
} as const

export const WikiLink = Node.create({
  name: 'wikiLink',
  ...inlineBase,
  addAttributes() {
    return {
      target: { default: '', parseHTML: (element: HTMLElement) => element.getAttribute('data-target') ?? '' }
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-wiki-link]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-wiki-link': '' })]
  },
  addNodeView() {
    // SFC props are declared at runtime; the renderer contract is NodeViewProps.
    return VueNodeViewRenderer(WikiLinkView as Component<NodeViewProps>)
  }
})

export const BlockRef = Node.create({
  name: 'blockRef',
  ...inlineBase,
  addAttributes() {
    return {
      note: { default: '', parseHTML: (element: HTMLElement) => element.getAttribute('data-note') ?? '' },
      blockId: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-block-id') ?? ''
      }
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-block-ref]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-block-ref': '' })]
  },
  addNodeView() {
    // SFC props are declared at runtime; the renderer contract is NodeViewProps.
    return VueNodeViewRenderer(BlockRefView as Component<NodeViewProps>)
  }
})

export const EmbedInline = Node.create({
  name: 'embedInline',
  ...inlineBase,
  addAttributes() {
    return {
      note: { default: '', parseHTML: (element: HTMLElement) => element.getAttribute('data-note') ?? '' },
      blockId: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-block-id') ?? ''
      }
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-embed-inline]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-embed-inline': '' })]
  },
  addNodeView() {
    return VueNodeViewRenderer(EmbedInlineView as Component<NodeViewProps>)
  }
})

export const EmbedBlock = Node.create({
  name: 'embedBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      note: { default: '', parseHTML: (element: HTMLElement) => element.getAttribute('data-note') ?? '' },
      blockId: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-block-id') ?? ''
      }
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-embed-block]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-embed-block': '' })]
  },
  addNodeView() {
    // SFC props are declared at runtime; the renderer contract is NodeViewProps.
    return VueNodeViewRenderer(EmbedBlockView as Component<NodeViewProps>)
  }
})
