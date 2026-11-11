// 渲染进程环境类型声明：注入的全局常量、preload 桥接 API 与 .vue 模块的类型补全。
import type { EasyNoteApi } from '@shared/contracts/api'

declare global {
  // 构建时由 electron.vite.config.ts 的 define 注入的应用版本号
  const __APP_VERSION__: string

  interface Window {
    // preload 经 contextBridge 暴露的白名单 API，渲染进程访问主进程的唯一入口
    easynote: EasyNoteApi
  }
}

// 让 TS 识别 .vue 单文件组件的默认导出（Volar 未覆盖时的兜底声明）
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

// 显式声明为模块，使上面的 declare global 生效而非污染脚本作用域
export {}
