// SQL LIKE 模式转义工具：防止用户输入中的通配符干扰查询语义。
// 转义 \ % _ 三个特殊字符，需配合 SQL 中的 ESCAPE '\' 子句使用。
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

// 生成 "值/%" 形式的前缀匹配模式，按 "/" 分隔匹配某路径下的所有子项。
export function likePrefix(value: string): string {
  return `${escapeLike(value)}/%`
}
