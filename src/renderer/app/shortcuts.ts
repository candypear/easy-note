// 全局快捷键分发器：window 上只挂一个 keydown 监听，
// 将按键归一化为 "ctrl+shift+x" 形式的组合串后匹配各模块注册的处理器。
import type { ShortcutRegistry } from './context'

interface Entry {
  combo: string
  handler: (event: KeyboardEvent) => void
}

// 归一化注册串：去空格、转小写，使 "Ctrl + S" 与 "ctrl+s" 等价
function normalize(combo: string): string {
  return combo
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .join('+')
}

// 从事件提取组合串：Ctrl 与 Cmd(meta) 统一记作 ctrl 以跨平台复用；
// 仅按修饰键本身时返回空串，避免误触发
function comboOf(event: KeyboardEvent): string {
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('ctrl')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey) parts.push('shift')
  const key = event.key.toLowerCase()
  if (['control', 'meta', 'alt', 'shift'].includes(key)) return ''
  parts.push(key)
  return parts.join('+')
}

export function createShortcuts(): ShortcutRegistry {
  const entries: Entry[] = []

  const onKeydown = (event: KeyboardEvent): void => {
    const combo = comboOf(event)
    if (!combo) return
    // 逆序遍历：后注册者优先（如浮层可覆盖全局键）；
    // 处理器调用 preventDefault 即视为已消费，停止继续分发
    for (const entry of [...entries].reverse()) {
      if (entry.combo !== combo) continue
      entry.handler(event)
      if (event.defaultPrevented) return
    }
  }

  window.addEventListener('keydown', onKeydown)
  return {
    register(combo, handler) {
      const entry: Entry = { combo: normalize(combo), handler }
      entries.push(entry)
      // 返回反注册闭包，按引用精确移除，不影响同组合键的其他注册
      return () => {
        const index = entries.indexOf(entry)
        if (index >= 0) entries.splice(index, 1)
      }
    },
    dispose() {
      entries.length = 0
      window.removeEventListener('keydown', onKeydown)
    }
  }
}
