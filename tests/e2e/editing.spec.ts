import { expect, test } from '@playwright/test'
import { appendToEditor, launchHarness, openNote } from './harness'

test('autosaves editor changes to the markdown file', async () => {
  const h = await launchHarness({ notes: { 'Alpha.md': '# Alpha\n\nBody text.\n' } })
  try {
    await appendToEditor(h.page, ' AUTOSAVE')

    await expect.poll(() => h.readVault('Alpha.md')).toContain('AUTOSAVE')
    await expect(h.page.locator('.statusbar')).toContainText('已保存')
    await expect(h.page.locator('.ProseMirror')).toContainText('AUTOSAVE')
  } finally {
    await h.close()
  }
})

test('source mode shows the current editor content and round-trips without data loss', async () => {
  test.fail(true, 'BUG: entering source mode serializes sourceValue (stale) instead of the live editor')
  const h = await launchHarness({ notes: { 'Alpha.md': '# Alpha\n\nBody text.\n' } })
  try {
    await appendToEditor(h.page, ' KEEPME')
    await expect.poll(() => h.readVault('Alpha.md')).toContain('KEEPME')

    await h.page.keyboard.press('Control+e')
    await expect(h.page.locator('.source-mode .cm-editor')).toBeVisible()
    await expect(h.page.locator('.source-mode .cm-content')).toContainText('KEEPME')

    await h.page.keyboard.press('Control+e')
    await expect(h.page.locator('.ProseMirror')).toContainText('KEEPME')
  } finally {
    await h.close()
  }
})

test('saves edits made in source mode', async () => {
  const h = await launchHarness({ notes: { 'Alpha.md': '# Alpha\n\nBody text.\n' } })
  try {
    await h.page.keyboard.press('Control+e')
    const source = h.page.locator('.source-mode .cm-content')
    await expect(source).toBeVisible()

    await source.click()
    await h.page.keyboard.press('Control+End')
    await h.page.keyboard.press('Enter')
    await h.page.keyboard.type('SOURCEEDIT')
    await expect.poll(() => h.readVault('Alpha.md')).toContain('SOURCEEDIT')

    await h.page.keyboard.press('Control+e')
    await expect(h.page.locator('.ProseMirror')).toContainText('SOURCEEDIT')
  } finally {
    await h.close()
  }
})

test('find and replace rewrites the note on disk', async () => {
  const h = await launchHarness({ notes: { 'Alpha.md': '# Alpha\n\nBody text with needle.\n' } })
  try {
    await h.page.keyboard.press('Control+f')
    const bar = h.page.locator('.find-bar')
    await expect(bar).toBeVisible()

    const inputs = bar.locator('input')
    await inputs.nth(0).fill('needle')
    await inputs.nth(1).fill('replaced')
    await bar.getByRole('button', { name: '全部替换' }).click()

    await expect.poll(() => h.readVault('Alpha.md')).toContain('replaced')
    await expect.poll(() => h.readVault('Alpha.md')).not.toContain('needle')
  } finally {
    await h.close()
  }
})

test('shows an external change banner and loads the disk version', async () => {
  const h = await launchHarness({ notes: { 'Alpha.md': '# Alpha\n\nOriginal body.\n' } })
  try {
    await h.page.waitForTimeout(600)
    h.writeVault('Alpha.md', '# Alpha\n\nEXTERNAL CHANGE\n')

    const banner = h.page.locator('.external-banner')
    await expect(banner).toBeVisible({ timeout: 15_000 })
    await banner.getByRole('button', { name: '加载磁盘版本' }).click()
    await expect(h.page.locator('.ProseMirror')).toContainText('EXTERNAL CHANGE')
  } finally {
    await h.close()
  }
})

test('keeps a saved table indexed as a table block', async () => {
  test.fail(true, 'BUG: serializer emits a one-dash delimiter that parseMarkdownBlocks rejects')
  const note = ['# Alpha', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', 'Tail.'].join('\n')
  const h = await launchHarness({ notes: { 'Alpha.md': note } })
  try {
    await appendToEditor(h.page, ' EDIT')
    await expect.poll(() => h.readVault('Alpha.md')).toContain('EDIT')

    const summary = await h.noteByTitle('Alpha')
    const blocks = await h.listBlocks(summary.id)
    expect(blocks.ok).toBe(true)
    if (blocks.ok) {
      expect(blocks.data.map((block) => block.type)).toContain('table')
    }
  } finally {
    await h.close()
  }
})

test('keeps a standalone inline tag after editing the note', async () => {
  test.fail(true, 'BUG: serializer escapes a leading #, and extractInlineTags no longer sees the tag')
  const h = await launchHarness({
    notes: { 'Tagged.md': '# Tagged\n\n#standalone\n\nBody text.\n' }
  })
  try {
    await appendToEditor(h.page, ' EDIT')
    await expect.poll(() => h.readVault('Tagged.md')).toContain('EDIT')

    const tags = await h.listTags()
    expect(tags.ok).toBe(true)
    if (tags.ok) {
      expect(tags.data.map((tag) => tag.name)).toContain('standalone')
    }
  } finally {
    await h.close()
  }
})

test('creates and opens the target of a missing wiki link', async () => {
  const h = await launchHarness({ notes: { 'Alpha.md': '# Alpha\n\nSee [[Missing]].\n' } })
  try {
    const missing = h.page.locator('.wiki-link.missing', { hasText: 'Missing' })
    await expect(missing).toBeVisible()
    await missing.click()

    await expect(h.page.locator('.ProseMirror h1')).toHaveText('Missing')
    await expect.poll(() => h.exists('Missing.md')).toBe(true)
  } finally {
    await h.close()
  }
})

test('renders block references and inline embeds', async () => {
  const h = await launchHarness({
    notes: {
      'Consumer.md': '# Consumer\n\nStart.\n',
      'Source.md': '# Source\n\nReference target.\n'
    }
  })
  try {
    const source = await h.noteByTitle('Source')
    const blocks = await h.listBlocks(source.id)
    if (!blocks.ok) throw new Error(`block:list-by-note failed: ${blocks.error.message}`)
    const block = blocks.data.find((entry) => entry.type === 'paragraph')
    if (!block) throw new Error('Source paragraph block not indexed')

    const consumer = await h.noteByTitle('Consumer')
    await h.saveNote(
      consumer.id,
      `# Consumer\n\nRef [[Source#^${block.id}]] and ![[Source#^${block.id}]].\n`
    )

    await openNote(h.page, 'Source')
    await openNote(h.page, 'Consumer')
    await expect(h.page.locator('.block-ref')).toHaveCount(1)
    await expect(h.page.locator('.embed-inline')).toHaveCount(1)
  } finally {
    await h.close()
  }
})
