// 窗口安全策略：拦截新窗口与导航、生产环境注入 CSP 并拒绝所有权限请求，收敛渲染进程攻击面。
import { app, session, shell, type BrowserWindow } from 'electron'

// 仅允许交给系统浏览器打开的协议白名单，阻止 file: 等危险协议被外部打开
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export function isAllowedExternalUrl(url: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    // 非法 URL 一律视为不允许
    return false
  }
}

export function applySecurity(window: BrowserWindow): void {
  // window.open 一律拒绝在应用内开窗；合法外链改由系统默认浏览器打开
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 拦截页面内导航，防止渲染进程被诱导跳转到外部页面（应用是单页，正常不会发生导航）
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault()
  })

  // 开发模式需要 dev server 的 HMR/eval 等能力，CSP 与权限限制仅在打包后启用
  if (!app.isPackaged) return

  // 严格 CSP：只允许自身来源脚本，禁 object/form/frame；style 放行 inline 以支持编辑器动态样式
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"
        ]
      }
    })
  })
  // 本应用不需要摄像头/麦克风/地理位置等任何 Web 权限，全部拒绝
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
}
