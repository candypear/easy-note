export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

export function likePrefix(value: string): string {
  return `${escapeLike(value)}/%`
}
