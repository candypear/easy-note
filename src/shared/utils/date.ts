// 日期工具：统一 ISO 序列化与中文相对时间展示，两端共用保证格式一致。
export function toIso(value: Date | number = new Date()): string {
  return new Date(value).toISOString()
}

export function formatRelativeTime(iso: string, now = Date.now()): string {
  // 未来时间按 0 处理，避免显示负数
  const diff = Math.max(0, now - new Date(iso).getTime())
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  // 超过 30 天改用绝对日期，相对时间已无意义
  return new Date(iso).toLocaleDateString('zh-CN')
}
