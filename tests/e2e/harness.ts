import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export interface NoteSummary {
  id: string
  title: string
  path: string
  folderPath: string
  modifiedAt: string
}

export interface NoteContent extends NoteSummary {
  content: string
}

export interface BlockSummary {
  id: string
  noteId: string
  ordinal: number
  type: string
  plainText: string
  markdown: string
  valid: boolean
}

export interface TagSummary {
  id: string
  name: string
  count: number
}

export type Ipc<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

/**
 * Minimal shape of the preload bridge used by tests. The full contract lives
 * in the renderer project, which is not part of the Node tsconfig program.
 */
interface BrowserGlobal {
  easynote: {
    note: {
      listAll(): Promise<unknown>
      read(noteId: string): Promise<unknown>
      save(noteId: string, content: string): Promise<unknown>
    }
    block: {
      listByNote(noteId: string): Promise<unknown>
    }
    tag: {
      list(): Promise<unknown>
    }
    vault: {
      open(path: string): Promise<unknown>
    }
  }
  document: {
    documentElement: unknown
    querySelectorAll(selector: string): { length: number }
  }
  getComputedStyle(element: unknown): { getPropertyValue(name: string): string }
}

export interface HarnessOptions {
  notes?: Record<string, string>
  settings?: Record<string, unknown>
  autoOpen?: boolean
}

export interface Harness {
  app: ElectronApplication
  page: Page
  root: string
  vault: string
  userData: string
  close(): Promise<void>
  readVault(relativePath: string): string
  writeVault(relativePath: string, content: string): void
  readSettings(): { theme: string; fontSize: number; vaultPath: string | null }
  exists(relativePath: string): boolean
  listNotes(): Promise<Ipc<NoteSummary[]>>
  readNote(noteId: string): Promise<Ipc<NoteContent>>
  saveNote(noteId: string, content: string): Promise<Ipc<unknown>>
  openVault(path: string): Promise<Ipc<unknown>>
  noteByTitle(title: string): Promise<NoteSummary>
  listBlocks(noteId: string): Promise<Ipc<BlockSummary[]>>
  listTags(): Promise<Ipc<TagSummary[]>>
}

const DEFAULT_SETTINGS = {
  theme: 'light',
  fontSize: 16,
  sidebarWidth: 260,
  rightWidth: 300,
  sidebarOpen: true,
  rightOpen: true,
  recentNoteIds: [],
  lastIndexedAt: null
}

function writeNote(vault: string, relativePath: string, content: string): void {
  const absolute = join(vault, relativePath)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, content)
}

export async function launchHarness(options: HarnessOptions = {}): Promise<Harness> {
  const root = mkdtempSync(join(tmpdir(), 'easynote-pw-'))
  const vault = join(root, 'vault')
  const userData = join(root, 'userData')
  mkdirSync(vault, { recursive: true })
  mkdirSync(userData, { recursive: true })

  const notes = options.notes ?? {}
  for (const [relativePath, content] of Object.entries(notes)) {
    writeNote(vault, relativePath, content)
  }

  const autoOpen = options.autoOpen ?? true
  writeFileSync(
    join(userData, 'settings.json'),
    JSON.stringify({
      ...DEFAULT_SETTINGS,
      vaultPath: autoOpen ? vault : null,
      ...options.settings
    })
  )

  const app = await electron.launch({
    args: ['.'],
    cwd: resolve('.'),
    env: { ...process.env, EASYNOTE_USER_DATA: userData },
    timeout: 60_000
  })
  const page = await app.firstWindow()

  if (autoOpen) {
    await page.waitForSelector('.app-shell', { timeout: 60_000 })
    if (Object.keys(notes).length > 0) {
      await page.waitForFunction(
        (count) =>
          (globalThis as unknown as BrowserGlobal).document.querySelectorAll('.note-row').length >=
          count,
        Object.keys(notes).length,
        { timeout: 30_000 }
      )
      await page.waitForSelector('.ProseMirror', { timeout: 30_000 })
    }
  } else {
    await page.waitForSelector('.vault-welcome', { timeout: 60_000 })
  }

  const listNotes = (): Promise<Ipc<NoteSummary[]>> =>
    page.evaluate(() =>
      (globalThis as unknown as BrowserGlobal).easynote.note.listAll()
    ) as Promise<Ipc<NoteSummary[]>>

  return {
    app,
    page,
    root,
    vault,
    userData,
    async close() {
      await app.close().catch(() => undefined)
      rmSync(root, { recursive: true, force: true, maxRetries: 5 })
    },
    readVault(relativePath: string) {
      return readFileSync(join(vault, relativePath), 'utf8')
    },
    writeVault(relativePath: string, content: string) {
      writeNote(vault, relativePath, content)
    },
    readSettings() {
      return JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')) as {
        theme: string
        fontSize: number
        vaultPath: string | null
      }
    },
    exists(relativePath: string) {
      try {
        readFileSync(join(vault, relativePath))
        return true
      } catch {
        return false
      }
    },
    listNotes,
    readNote(noteId: string) {
      return page.evaluate(
        (id) => (globalThis as unknown as BrowserGlobal).easynote.note.read(id),
        noteId
      ) as Promise<Ipc<NoteContent>>
    },
    saveNote(noteId: string, content: string) {
      return page.evaluate(
        (payload) =>
          (globalThis as unknown as BrowserGlobal).easynote.note.save(
            payload.noteId,
            payload.content
          ),
        { noteId, content }
      ) as Promise<Ipc<unknown>>
    },
    openVault(path: string) {
      return page.evaluate(
        (target) => (globalThis as unknown as BrowserGlobal).easynote.vault.open(target),
        path
      ) as Promise<Ipc<unknown>>
    },
    async noteByTitle(title: string) {
      const result = await listNotes()
      if (!result.ok) throw new Error(`note:list-all failed: ${result.error.message}`)
      const note = result.data.find((entry) => entry.title === title)
      if (!note) throw new Error(`note not found: ${title}`)
      return note
    },
    listBlocks(noteId: string) {
      return page.evaluate(
        (id) => (globalThis as unknown as BrowserGlobal).easynote.block.listByNote(id),
        noteId
      ) as Promise<Ipc<BlockSummary[]>>
    },
    listTags() {
      return page.evaluate(() =>
        (globalThis as unknown as BrowserGlobal).easynote.tag.list()
      ) as Promise<Ipc<TagSummary[]>>
    }
  }
}

/** Appends text at the end of the WYSIWYG document. */
export async function appendToEditor(page: Page, text: string): Promise<void> {
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

export async function openNote(page: Page, title: string): Promise<void> {
  await page.getByRole('treeitem', { name: title, exact: true }).click()
  await page.waitForTimeout(250)
}

export function readBodyFontSize(page: Page): Promise<string> {
  return page.evaluate(() => {
    // The preload bridge plus DOM globals are not declared in the Node tsconfig program.
    const view = globalThis as unknown as BrowserGlobal
    return view
      .getComputedStyle(view.document.documentElement)
      .getPropertyValue('--font-size-body')
  })
}
