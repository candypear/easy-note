import { expect, test } from '@playwright/test'
import { appendToEditor, launchHarness, openNote } from './harness'

test('creates a new note with Ctrl+N and autosaves it', async () => {
  const h = await launchHarness({ notes: { 'Alpha.md': '# Alpha\n\nBody.\n' } })
  try {
    await h.page.keyboard.press('Control+n')
    await expect(h.page.locator('.note-row')).toHaveCount(2)
    await expect(h.page.locator('.ProseMirror h1')).toHaveText('未命名')

    await appendToEditor(h.page, ' NEWCONTENT')
    await expect.poll(() => h.readVault('未命名.md')).toContain('NEWCONTENT')
    await expect.poll(() => h.readVault('未命名.md')).toContain('# 未命名')
  } finally {
    await h.close()
  }
})

test('renaming via F2 updates the file heading and incoming wiki links', async () => {
  const h = await launchHarness({
    notes: {
      'A.md': '# A\n\nLink [[B]].\n',
      'B.md': '# B\n\nBody.\n'
    }
  })
  try {
    const row = h.page.getByRole('treeitem', { name: 'B', exact: true })
    await row.click()
    await expect(h.page.locator('.ProseMirror h1')).toHaveText('B')

    await row.focus()
    await h.page.keyboard.press('F2')
    const rename = h.page.locator('.rename')
    await expect(rename).toBeVisible()
    await rename.fill('Gamma')
    await rename.press('Enter')

    await expect.poll(() => h.exists('Gamma.md')).toBe(true)
    await expect.poll(() => h.readVault('Gamma.md')).toContain('# Gamma')
    await expect.poll(() => h.readVault('A.md')).toContain('[[Gamma]]')
  } finally {
    await h.close()
  }
})

test('renaming the open note refreshes the editor heading', async () => {
  test.fail(true, 'BUG: note:renamed reloads the explorer but not the open editor')
  const h = await launchHarness({
    notes: {
      'A.md': '# A\n\nLink [[B]].\n',
      'B.md': '# B\n\nBody.\n'
    }
  })
  try {
    const row = h.page.getByRole('treeitem', { name: 'B', exact: true })
    await row.click()
    await expect(h.page.locator('.ProseMirror h1')).toHaveText('B')

    await row.focus()
    await h.page.keyboard.press('F2')
    const rename = h.page.locator('.rename')
    await rename.fill('Gamma')
    await rename.press('Enter')
    await expect.poll(() => h.exists('Gamma.md')).toBe(true)

    await expect(h.page.locator('.ProseMirror h1')).toHaveText('Gamma')
  } finally {
    await h.close()
  }
})

test('lists tags and filters notes by selected tag', async () => {
  test.fail(true, 'BUG: tag filter passes a Vue reactive Proxy over IPC, which cannot be cloned')
  const h = await launchHarness({
    notes: {
      'Alpha.md': '# Alpha\n\n#alpha common\n',
      'Beta.md': '# Beta\n\n#beta common\n',
      'Gamma.md': '# Gamma\n\n#alpha #beta\n'
    }
  })
  try {
    await h.page.locator('.sidebar .tab', { hasText: '标签' }).click()
    const rows = h.page.locator('.tag-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('alpha')
    await expect(rows.nth(1)).toContainText('beta')

    await h.page.locator('.tag-row', { hasText: 'alpha' }).click()
    await expect(h.page.locator('.tags-view .result')).toHaveCount(2)
    await expect(h.page.locator('.tags-view .results')).toContainText('Alpha')
    await expect(h.page.locator('.tags-view .results')).toContainText('Gamma')
  } finally {
    await h.close()
  }
})

test('searches note bodies and opens the selected result', async () => {
  const h = await launchHarness({
    notes: {
      'Alpha.md': '# Alpha\n\nneedle alpha body.\n',
      'Beta.md': '# Beta\n\nneedle beta body.\n'
    }
  })
  try {
    await h.page.locator('.sidebar .tab', { hasText: '搜索' }).click()
    const input = h.page.locator('.search-view input')
    await input.fill('needle')

    const results = h.page.locator('.search-view .result')
    await expect(results).toHaveCount(2)
    await h.page.locator('.search-view .result', { hasText: 'Alpha' }).click()

    await expect(h.page.locator('.ProseMirror')).toContainText('needle alpha body')
  } finally {
    await h.close()
  }
})

test('lists reverse links pointing at the current note', async () => {
  const h = await launchHarness({
    notes: {
      'Alpha.md': '# Alpha\n\nLink to [[Beta]].\n',
      'Beta.md': '# Beta\n\nBody.\n'
    }
  })
  try {
    await openNote(h.page, 'Beta')
    const linked = h.page.locator('.backlinks .entry')
    await expect(linked).toContainText('Alpha')
    await expect(linked).toContainText('Link to Beta')
  } finally {
    await h.close()
  }
})

test('converts all unlinked mentions into wiki links', async () => {
  const h = await launchHarness({
    notes: {
      'Alpha.md': '# Alpha\n\nBeta is mentioned here without a link.\n',
      'Beta.md': '# Beta\n\nBody.\n'
    }
  })
  try {
    await openNote(h.page, 'Beta')
    await expect(h.page.locator('.backlinks')).toContainText('未链接提及')

    await h.page.locator('.backlinks .text-button', { hasText: '全部转换' }).click()
    await expect.poll(() => h.readVault('Alpha.md')).toContain('[[Beta]]')
  } finally {
    await h.close()
  }
})

test('deletes a note through the explorer into the system trash', async () => {
  const h = await launchHarness({
    notes: {
      'Alpha.md': '# Alpha\n\nBody.\n',
      'Beta.md': '# Beta\n\nBody.\n'
    }
  })
  try {
    const row = h.page.getByRole('treeitem', { name: 'Beta', exact: true })
    await row.click({ button: 'right' })
    await h.page.getByRole('menuitem', { name: '删除' }).click()

    const dialog = h.page.locator('.dialog-panel')
    await expect(dialog).toContainText('删除笔记')
    await dialog.getByRole('button', { name: '移入回收站' }).click()

    await expect(h.page.locator('.note-row .label')).toHaveText(['Alpha'])
    await expect.poll(() => h.exists('Beta.md')).toBe(false)
  } finally {
    await h.close()
  }
})
