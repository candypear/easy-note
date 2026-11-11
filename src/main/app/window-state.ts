// 窗口几何状态持久化：读写 window-state.json，读取时做合法性校验，保证窗口不会落到屏幕外。
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

// 判断坐标是否落在任一显示器内；放宽 40px 容差，允许窗口标题栏略微移出屏幕边缘
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
    // 尺寸兜底到最小窗口尺寸，防止损坏数据导致窗口过小
    const width = Math.max(1024, Number(raw.width) || DEFAULT_STATE.width)
    const height = Math.max(680, Number(raw.height) || DEFAULT_STATE.height)
    const state: WindowState = {
      width,
      height,
      maximized: Boolean(raw.maximized)
    }
    // 仅在坐标有效且仍在当前显示器布局内时才恢复位置（外接屏拔掉后回退到默认居中）
    if (Number.isFinite(raw.x) && Number.isFinite(raw.y) && isOnScreen(Number(raw.x), Number(raw.y))) {
      state.x = Number(raw.x)
      state.y = Number(raw.y)
    }
    return state
  } catch {
    // 文件损坏或解析失败时回退默认值，不阻塞启动
    return { ...DEFAULT_STATE }
  }
}

export function writeWindowState(file: string, state: WindowState): void {
  try {
    writeFileSync(file, JSON.stringify(state), 'utf8')
  } catch {
    // 窗口几何持久化尽力而为，写失败可忽略。
  }
}
