import { expect, test } from '@playwright/test'
import { appendToEditor, launchHarness, readBodyFontSize } from './harness'

const FENCE = '```'

const RICH_NOTE = [
  '# Alpha',
  '',
  'Paragraph with **bold** and `inline` and $x^2$.',
  '',
  '> quote',
  '',
  '- item one',
  '- item two',
  '',
  '- [ ] task one',
  '- [x] task two',
  '',
  '| col a | col b |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  `${FENCE}ts`,
  'const answer = 42',
  FENCE,
  '',
  '$$',
  'a^2 + b^2 = c^2',
  '$$',
  '',
  'Link [[Beta]].'
].join('\n')

const BETA_NOTE = '# Beta\n\nBeta body with needle.\n'

test('boots into the vault and renders the supported markdown blocks', async () => {
  const h = await launchHarness({ notes: { 'Alpha.md': RICH_NOTE, 'Beta.md': BETA_NOTE } })
  try {
    await expect(h.page.locator('.app-shell')).toBeVisible()
    await expect(h.page.locator('.note-row .label')).toHaveText(['Alpha', 'Beta'])

    const editor = h.page.locator('.ProseMirror')
    await expect(editor.locator('h1')).toHaveText('Alpha')
    await expect(editor.locator('strong')).toHaveText('bold')
    await expect(editor.locator('blockquote')).toContainText('quote')
    await expect(editor.locator('.code-block')).toHaveCount(1)
    await expect(editor.locator('.math-inline')).toHaveCount(1)
    await expect(editor.locator('.math-block')).toHaveCount(1)
    await expect(editor.locator('table')).toHaveCount(1)
    await expect(editor.locator('ul[data-type="taskList"] input[type="checkbox"]')).toHaveCount(2)
    await expect(editor.locator('.wiki-link')).toHaveText('Beta')

    await expect(h.page.locator('.statusbar')).toContainText('已保存')
    await expect(h.page.locator('.statusbar .stats')).toContainText('字')
  } finally {
    await h.close()
  }
})

test('applies persisted theme and font size on startup', async () => {
  const h = await launchHarness({
    notes: { 'Alpha.md': '# Alpha\n\nBody.\n' },
    settings: { theme: 'dark', fontSize: 18 }
  })
  try {
    await expect(h.page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect((await readBodyFontSize(h.page)).trim()).toBe('18px')
  } finally {
    await h.close()
  }
})

test('switches theme from the top bar and persists it', async () => {
  const h = await launchHarness({ notes: { 'Alpha.md': '# Alpha\n\nBody.\n' } })
  try {
    await h.page.locator('[aria-label="主题"]').click()
    await h.page.getByRole('menuitem', { name: '暗色' }).click()
    await expect(h.page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await expect.poll(() => h.readSettings().theme).toBe('dark')
  } finally {
    await h.close()
  }
})

test('opens the settings dialog and closes it with Escape', async () => {
  const h = await launchHarness({ notes: { 'Alpha.md': '# Alpha\n\nBody.\n' } })
  try {
    await h.page.locator('[aria-label="设置"]').click()
    const dialog = h.page.locator('.dialog-panel')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('笔记库')
    await expect(dialog).toContainText(h.vault)

    await h.page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  } finally {
    await h.close()
  }
})

test('lists headings in the outline panel and keeps word statistics in sync', async () => {
  const h = await launchHarness({
    notes: { 'Alpha.md': '# Alpha\n\n## Section\n\nSome body text.\n' }
  })
  try {
    await h.page.locator('.right-panel [role="tab"]', { hasText: '大纲' }).click()
    const items = h.page.locator('.outline .item')
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toHaveText('Alpha')
    await expect(items.nth(1)).toHaveText('Section')

    const before = Number((await h.page.locator('.statusbar .stats').innerText()).match(/(\d+)\s*字符/)?.[1])
    await appendToEditor(h.page, ' EXTRA')
    await expect
      .poll(async () => {
        const text = await h.page.locator('.statusbar .stats').innerText()
        return Number(text.match(/(\d+)\s*字符/)?.[1])
      })
      .toBeGreaterThan(before)
  } finally {
    await h.close()
  }
})

test('opens quick switch with Ctrl+K and opens the selected note', async () => {
  const h = await launchHarness({ notes: { 'Alpha.md': RICH_NOTE, 'Beta.md': BETA_NOTE } })
  try {
    await h.page.keyboard.press('Control+k')
    const overlay = h.page.locator('.quick-switch')
    await expect(overlay).toBeVisible()

    await overlay.locator('input').fill('Beta')
    await expect(overlay.locator('.result').first()).toContainText('Beta')
    await overlay.locator('input').press('Enter')

    await expect(overlay).toHaveCount(0)
    await expect(h.page.locator('.ProseMirror h1')).toHaveText('Beta')
  } finally {
    await h.close()
  }
})

test('renders the graph view and returns to the editor', async () => {
  const h = await launchHarness({ notes: { 'Alpha.md': RICH_NOTE, 'Beta.md': BETA_NOTE } })
  try {
    await h.page.locator('.graph-button').click()
    await expect(h.page.locator('.graph-view canvas')).toBeVisible()
    await expect(h.page.locator('.graph-view')).toContainText('全局')

    await h.page.locator('.graph-view .text-button', { hasText: '返回笔记' }).click()
    await expect(h.page.locator('.ProseMirror')).toBeVisible()
  } finally {
    await h.close()
  }
})

test('first-run welcome opens a chosen folder and seeds the sample note', async () => {
  const h = await launchHarness({ autoOpen: false })
  try {
    await expect(h.page.locator('.vault-welcome')).toBeVisible()
    await h.openVault(h.vault)

    await expect(h.page.locator('.app-shell')).toBeVisible()
    await expect(h.page.locator('.note-row .label')).toHaveText(['欢迎使用 EasyNote'])
    await expect
      .poll(() => h.exists('欢迎使用 EasyNote.md'))
      .toBe(true)
  } finally {
    await h.close()
  }
})

test('creates a folder and a note inside it from the explorer toolbar', async () => {
  const h = await launchHarness({ notes: { 'Alpha.md': '# Alpha\n\nBody.\n' } })
  try {
    const toolbarNew = h.page.locator('.file-tree .toolbar-button', { hasText: '新建' })
    await toolbarNew.click()
    await h.page.getByRole('menuitem', { name: '新建文件夹' }).click()

    const folderRow = h.page.locator('.folder-row', { hasText: '新建文件夹' })
    await expect(folderRow).toBeVisible()
    await folderRow.click()
    await folderRow.press('F2')
    const rename = h.page.locator('.rename')
    await rename.fill('Projects')
    await rename.press('Enter')
    await expect(h.page.locator('.folder-row', { hasText: 'Projects' })).toBeVisible()

    await h.page.locator('.folder-row', { hasText: 'Projects' }).click()
    await toolbarNew.click()
    await h.page.getByRole('menuitem', { name: '新建笔记' }).click()

    await expect(h.page.locator('.note-row', { hasText: '未命名' })).toBeVisible()
    await expect.poll(() => h.exists('Projects/未命名.md')).toBe(true)
  } finally {
    await h.close()
  }
})
