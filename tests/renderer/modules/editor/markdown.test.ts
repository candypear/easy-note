import { describe, expect, it } from 'vitest'
import { markdownToDocument } from '@renderer/modules/editor/extensions/markdown/parser'
import {
  documentToMarkdown,
  extractPlainText
} from '@renderer/modules/editor/extensions/markdown/serializer'

const SAMPLE = `---
tags: [测试]
---

# 标题

段落包含 **粗体**、*斜体*、~~删除线~~ 与 \`行内代码\`。

- 项目一
- 项目二

- [ ] 待办
- [x] 完成

1. 第一
2. 第二

> 引用

\`\`\`ts
const value: number = 1
\`\`\`

$$
a^2 + b^2 = c^2
$$

行内公式 $x + y$。

[[目标]] 与 [[目标#^block01]] 与 ![[目标#^block01]]

| 列一 | 列二 |
| --- | --- |
| 甲 | 乙 |

<div>原始 HTML</div>

![替代](image.png)
`

describe('markdown round trip', () => {
  it('maps every supported syntax to editor nodes', () => {
    const { doc } = markdownToDocument(SAMPLE)
    expect(doc.type).toBe('doc')
    const types = new Set<string>()
    for (const node of doc.content ?? []) {
      types.add(node.type ?? '')
      for (const child of node.content ?? []) types.add(child.type ?? '')
    }
    expect(types).toContain('heading')
    expect(types).toContain('bulletList')
    expect(types).toContain('taskList')
    expect(types).toContain('orderedList')
    expect(types).toContain('blockquote')
    expect(types).toContain('codeBlock')
    expect(types).toContain('mathBlock')
    expect(types).toContain('table')
    expect(types).toContain('htmlBlock')
  })

  it('keeps frontmatter, wiki links, math and raw html', () => {
    const { doc, frontmatter } = markdownToDocument(SAMPLE)
    const markdown = documentToMarkdown(doc, frontmatter)
    expect(markdown).toContain('tags: [测试]')
    expect(markdown).toContain('[[目标]]')
    expect(markdown).toContain('[[目标#^block01]]')
    expect(markdown).toContain('![[目标#^block01]]')
    expect(markdown).toContain('```ts')
    expect(markdown).toContain('行内公式 $x + y$')
    expect(markdown).toContain('<div>原始 HTML</div>')
    expect(markdown).toContain('![替代](image.png)')
  })

  it('is idempotent after one normalization pass', () => {
    const first = markdownToDocument(SAMPLE)
    const once = documentToMarkdown(first.doc, first.frontmatter)
    const second = markdownToDocument(once)
    const twice = documentToMarkdown(second.doc, second.frontmatter)
    expect(twice).toBe(once)
  })

  it('does not merge regular and task lists', () => {
    const { doc } = markdownToDocument('- 普通\n- 普通二\n\n- [ ] 任务\n- [x] 完成')
    const types = (doc.content ?? []).map((node) => node.type)
    expect(types).toEqual(['bulletList', 'taskList'])
  })

  it('excludes code and math source from plain text', () => {
    const { doc } = markdownToDocument('正文\n\n```ts\nconst hidden = true\n```\n\n$$\nsecret\n$$')
    const text = extractPlainText(doc)
    expect(text).toContain('正文')
    expect(text).not.toContain('hidden')
    expect(text).not.toContain('secret')
  })
})
