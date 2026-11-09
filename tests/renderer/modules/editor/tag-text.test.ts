import { expect, it } from 'vitest'
import { markdownToDocument } from '@renderer/modules/editor/extensions/markdown/parser'
import { documentToMarkdown } from '@renderer/modules/editor/extensions/markdown/serializer'

it('preserves inline tag paragraphs', () => {
  const { doc, frontmatter } = markdownToDocument('普通段落。\n\n标签 #冒烟\n\n- 列表')
  const out = documentToMarkdown(doc, frontmatter)
  expect(out).toContain('标签 #冒烟')
  expect(out).toContain('- 列表')
})
