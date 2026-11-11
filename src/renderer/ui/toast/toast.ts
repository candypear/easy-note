// 全局 toast 队列：模块级 reactive 单例，任何地方调用 toast() 即可提示，
// 由挂在应用外壳的 ToastHost 统一渲染；错误提示停留更久便于阅读。
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
