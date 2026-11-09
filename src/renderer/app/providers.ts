import { inject, type InjectionKey } from 'vue'
import type { RendererContext } from './context'

export const RENDERER_CONTEXT: InjectionKey<RendererContext> = Symbol('easynote:context')

export function useContext(): RendererContext {
  const ctx = inject(RENDERER_CONTEXT)
  if (!ctx) throw new Error('RendererContext is not provided')
  return ctx
}
