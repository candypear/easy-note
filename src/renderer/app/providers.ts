// 上下文注入入口：用带类型的 InjectionKey 分发 RendererContext，
// 组件统一经 useContext() 取用，避免各处硬编码字符串 key。
import { inject, type InjectionKey } from 'vue'
import type { RendererContext } from './context'

export const RENDERER_CONTEXT: InjectionKey<RendererContext> = Symbol('easynote:context')

// 缺少 provide 时立即抛错，尽早暴露"组件在上下文之外使用"的装配问题
export function useContext(): RendererContext {
  const ctx = inject(RENDERER_CONTEXT)
  if (!ctx) throw new Error('RendererContext is not provided')
  return ctx
}
