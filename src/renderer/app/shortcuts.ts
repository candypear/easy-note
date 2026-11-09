import type { ShortcutRegistry } from './context'

interface Entry {
  combo: string
  handler: (event: KeyboardEvent) => void
}

function normalize(combo: string): string {
  return combo
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .join('+')
}

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
