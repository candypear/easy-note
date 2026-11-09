import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Table from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { Extension, type Editor as CoreEditor, type Extensions, type JSONContent } from '@tiptap/core'
import { Editor as EditorClass } from '@tiptap/vue-3'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { countWords } from '@shared/utils/text'
import type { Heading } from '../../../app/context'
import { CodeBlock } from '../extensions/code-block/code-block-node'
import { HtmlBlock } from '../extensions/markdown/html-block'
import { MarkdownImage } from '../extensions/markdown/image-node'
import { MathBlock, MathInline } from '../extensions/math/math-node'
import { BlockRef, EmbedBlock, EmbedInline, WikiLink } from '../extensions/wiki-link/wiki-link-node'
import { extractPlainText } from '../extensions/markdown/serializer'

export interface EditorOptions {
  placeholder: string
  content: JSONContent
  onUpdate(): void
  onSelectionChange(): void
}

function moveBlock(editor: CoreEditor, direction: -1 | 1): boolean {
  const { state } = editor
  const { $from } = state.selection
  if ($from.depth === 0) return false
  const depth = $from.depth
  const parent = $from.node(depth - 1)
  const index = $from.index(depth - 1)
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= parent.childCount) return false

  const node = parent.child(index)
  const from = $from.before(depth)
  let insertPos = $from.start(depth - 1)
  for (let i = 0; i < targetIndex; i += 1) insertPos += parent.child(i).nodeSize
  if (direction > 0) insertPos += node.nodeSize

  const tr = state.tr.delete(from, from + node.nodeSize)
  const mapped = tr.mapping.map(insertPos)
  tr.insert(mapped, node)
  tr.setSelection(TextSelection.near(tr.doc.resolve(mapped + 1)))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

const EditorKeymap = Extension.create({
  name: 'easynoteKeymap',
  addKeyboardShortcuts() {
    const listType = (): 'taskItem' | 'listItem' | null =>
      this.editor.isActive('taskItem')
        ? 'taskItem'
        : this.editor.isActive('listItem')
          ? 'listItem'
          : null
    return {
      Tab: () => {
        const type = listType()
        if (!type) return false
        return this.editor.chain().focus().sinkListItem(type).run()
      },
      'Shift-Tab': () => {
        const type = listType()
        if (!type) return false
        return this.editor.chain().focus().liftListItem(type).run()
      },
      'Alt-ArrowUp': () => moveBlock(this.editor, -1),
      'Alt-ArrowDown': () => moveBlock(this.editor, 1)
    }
  }
})

export function buildExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] }
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' }
    }),
    Placeholder.configure({ placeholder }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    CodeBlock,
    MathBlock,
    MathInline,
    WikiLink,
    BlockRef,
    EmbedBlock,
    EmbedInline,
    MarkdownImage,
    HtmlBlock,
    EditorKeymap
  ]
}

export function createEditor(options: EditorOptions): EditorClass {
  return new EditorClass({
    extensions: buildExtensions(options.placeholder),
    content: options.content,
    editorProps: {
      attributes: { class: 'editor-content', spellcheck: 'false' }
    },
    onUpdate: options.onUpdate,
    onSelectionUpdate: options.onSelectionChange
  })
}

export function documentStats(doc: JSONContent): {
  words: number
  characters: number
  readingMinutes: number
} {
  return countWords(extractPlainText(doc))
}

export function collectHeadings(doc: ProseMirrorNode): Heading[] {
  const headings: Heading[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({
        level: Number(node.attrs.level ?? 1),
        text: node.textContent.trim(),
        pos
      })
    }
    return true
  })
  return headings
}
