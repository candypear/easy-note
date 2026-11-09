import { reactive } from 'vue'

export interface ToastItem {
  id: number
  message: string
  type: 'info' | 'error'
}

const state = reactive<{ items: ToastItem[] }>({ items: [] })
let nextId = 1

export function useToast(): {
  items: ToastItem[]
  show(message: string, type?: ToastItem['type']): void
  dismiss(id: number): void
} {
  return {
    items: state.items,
    show(message, type = 'info') {
      const id = nextId++
      state.items.push({ id, message, type })
      setTimeout(() => dismiss(id), type === 'error' ? 5000 : 3000)
    },
    dismiss
  }
}

export function dismiss(id: number): void {
  const index = state.items.findIndex((item) => item.id === id)
  if (index >= 0) state.items.splice(index, 1)
}

export function toast(message: string, type: ToastItem['type'] = 'info'): void {
  const id = nextId++
  state.items.push({ id, message, type })
  setTimeout(() => dismiss(id), type === 'error' ? 5000 : 3000)
}
