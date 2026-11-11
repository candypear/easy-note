// 品牌类型（branded types）：给字符串 ID 附加编译期标记，防止 NoteId/BlockId 等不同 ID 互相误传。
// 仅类型层面生效，运行时仍是普通字符串，可安全跨 IPC 序列化。
declare const brand: unique symbol

// unique symbol 键无法在外部构造，因此只能通过下方 asXxx 断言函数获得品牌类型
export type Brand<T, B extends string> = T & { readonly [brand]: B }

export type NoteId = Brand<string, 'NoteId'>
export type FolderId = Brand<string, 'FolderId'>
export type BlockId = Brand<string, 'BlockId'>
export type LinkId = Brand<string, 'LinkId'>
export type TagId = Brand<string, 'TagId'>
export type VaultId = Brand<string, 'VaultId'>

// 显式断言入口：在 IPC 边界等可信位置把原始字符串收窄为品牌 ID
export const asNoteId = (value: string): NoteId => value as NoteId
export const asFolderId = (value: string): FolderId => value as FolderId
export const asBlockId = (value: string): BlockId => value as BlockId
export const asLinkId = (value: string): LinkId => value as LinkId
export const asTagId = (value: string): TagId => value as TagId
export const asVaultId = (value: string): VaultId => value as VaultId
