// 轻量 i18n 实现：扁平 key→文案 查表 + {name} 占位符插值，
// 不引入第三方库；缺失 key 时回退为 key 本身以便暴露漏配。
import type { I18n } from '../app/context'

export type Messages = Record<string, string>

export function createI18n(messages: Messages): I18n {
  return {
    t(key, params) {
      const template = messages[key] ?? key
      if (!params) return template
      // 仅替换提供了值的占位符，未提供的保留原样便于排查
      return template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = params[name]
        return value === undefined ? match : String(value)
      })
    }
  }
}
