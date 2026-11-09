/* E2E smoke: launches Electron against a temporary vault, loads a note,
 * types through real input events, waits for autosave, and asserts the file. */
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const electron = require('electron')

const SAMPLE = `# 冒烟笔记

普通段落，包含 **粗体** 与 \`行内代码\`。

标签 #冒烟

- 列表
- [ ] 任务

\`\`\`ts
const answer = 42
\`\`\`

$$
a^2 + b^2 = c^2
$$

链接 [[冒烟笔记#^block01]]。
`

const root = mkdtempSync(join(tmpdir(), 'easynote-e2e-'))
const vault = join(root, 'vault')
const userData = join(root, 'userData')
mkdirSync(vault, { recursive: true })
mkdirSync(userData, { recursive: true })
writeFileSync(join(vault, '冒烟笔记.md'), SAMPLE)
writeFileSync(
  join(userData, 'settings.json'),
  JSON.stringify({
    theme: 'system',
    fontSize: 16,
    vaultPath: vault,
    sidebarWidth: 260,
    rightWidth: 300,
    sidebarOpen: true,
    rightOpen: true,
    recentNoteIds: [],
    lastIndexedAt: null
  })
)

const child = spawn(electron, ['.'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    EASYNOTE_SMOKE: '1',
    EASYNOTE_SMOKE_EDIT: '1',
    EASYNOTE_SMOKE_UI: '1',
    EASYNOTE_USER_DATA: userData
  },
  stdio: ['ignore', 'pipe', 'pipe']
})

let output = ''
child.stdout.on('data', (chunk) => {
  output += chunk.toString()
})
child.stderr.on('data', (chunk) => {
  output += chunk.toString()
})

const timeout = setTimeout(() => {
  child.kill()
}, 60000)

child.on('exit', (code) => {
  clearTimeout(timeout)
  const line = output
    .split(/\r?\n/)
    .find((entry) => entry.startsWith('[smoke] '))
  if (!line) {
    console.error(output)
    console.error('e2e smoke failed: no [smoke] result')
    process.exit(1)
  }
  const result = JSON.parse(line.slice('[smoke] '.length))
  const failures = []
  if (result.api !== 'object') failures.push('preload api missing')
  if (result.mounted !== true) failures.push('renderer not mounted')
  if (result.editor !== true) failures.push('editor not ready')
  if (!(result.codeBlocks >= 1)) failures.push('code block not rendered')
  if (!(result.mathBlocks >= 1)) failures.push('math block not rendered')
  if (result.saved !== true) failures.push('autosave did not persist edits')
  const content = readFileSync(join(vault, '冒烟笔记.md'), 'utf8')
  if (!content.includes('SMOKE-')) failures.push('saved file missing marker')
  const ui = result.ui ?? {}
  if (ui.settings !== true) failures.push('settings dialog did not open')
  if (ui.settingsClosed !== true) failures.push('settings dialog did not close')
  if (ui.quickSwitch !== true) failures.push('quick switch did not open')
  if (ui.tags !== true) failures.push('tags view did not render')
  if (!(ui.tagRows >= 1)) failures.push('tags missing from index')
  if (ui.search !== true) failures.push('search view did not render')
  if (ui.graph !== true) failures.push('graph view did not render')
  if (ui.backToEditor !== true) failures.push('did not return to editor')
  if (ui.sourceMode !== true) failures.push('source mode did not open')
  if (ui.wysiwyg !== true) failures.push('did not return from source mode')
  if (!(ui.searchResults >= 1)) failures.push('search returned no results')
  if (ui.revealed !== true) failures.push('search hit did not reveal the matched block')
  if (failures.length > 0 || code !== 0) {
    console.error('[smoke]', JSON.stringify(result))
    console.error(failures.join('\n'))
    console.error(output)
    process.exit(1)
  }
  rmSync(root, { recursive: true, force: true })
  console.log('✓ e2e smoke ok')
  process.exit(0)
})
