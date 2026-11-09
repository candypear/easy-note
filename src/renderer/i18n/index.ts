import type { I18n } from '../app/context'

export type Messages = Record<string, string>

export function createI18n(messages: Messages): I18n {
  return {
    t(key, params) {
      const template = messages[key] ?? key
      if (!params) return template
      return template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = params[name]
        return value === undefined ? match : String(value)
      })
    }
  }
}
