// 代码块自定义节点：代码文本存于 code 属性而非子节点（atom），
// 用 Vue NodeView 桥接 CodeMirror 编辑；支持 ``` 输入规则快捷创建。
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
    // SFC 的 props 在运行时声明，这里断言为 NodeViewProps 以满足渲染器契约
    return VueNodeViewRenderer(CodeBlockView as Component<NodeViewProps>)
  },
  addInputRules() {
    return [
      // 行首输入 ```语言 即替换为代码块节点，语言可省略
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
