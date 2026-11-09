import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { screen } from 'electron'

export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

const DEFAULT_STATE: WindowState = {
  width: 1280,
  height: 820,
  maximized: false
}

const isOnScreen = (x: number, y: number): boolean =>
  screen
    .getAllDisplays()
    .some(
      (display) =>
        x >= display.bounds.x - 40 &&
        y >= display.bounds.y - 40 &&
        x < display.bounds.x + display.bounds.width &&
        y < display.bounds.y + display.bounds.height
    )

export function readWindowState(file: string): WindowState {
  if (!existsSync(file)) return { ...DEFAULT_STATE }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<WindowState>
    const width = Math.max(1024, Number(raw.width) || DEFAULT_STATE.width)
    const height = Math.max(680, Number(raw.height) || DEFAULT_STATE.height)
    const state: WindowState = {
      width,
      height,
      maximized: Boolean(raw.maximized)
    }
    if (Number.isFinite(raw.x) && Number.isFinite(raw.y) && isOnScreen(Number(raw.x), Number(raw.y))) {
      state.x = Number(raw.x)
      state.y = Number(raw.y)
    }
    return state
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function writeWindowState(file: string, state: WindowState): void {
  try {
    writeFileSync(file, JSON.stringify(state), 'utf8')
  } catch {
    // Window geometry persistence is best effort.
  }
}
