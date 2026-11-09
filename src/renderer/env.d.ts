import type { EasyNoteApi } from '@shared/contracts/api'

declare global {
  const __APP_VERSION__: string

  interface Window {
    easynote: EasyNoteApi
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

export {}
