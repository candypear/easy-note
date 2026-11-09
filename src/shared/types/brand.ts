declare const brand: unique symbol

export type Brand<T, B extends string> = T & { readonly [brand]: B }

export type NoteId = Brand<string, 'NoteId'>
export type FolderId = Brand<string, 'FolderId'>
export type BlockId = Brand<string, 'BlockId'>
export type LinkId = Brand<string, 'LinkId'>
export type TagId = Brand<string, 'TagId'>
export type VaultId = Brand<string, 'VaultId'>

export const asNoteId = (value: string): NoteId => value as NoteId
export const asFolderId = (value: string): FolderId => value as FolderId
export const asBlockId = (value: string): BlockId => value as BlockId
export const asLinkId = (value: string): LinkId => value as LinkId
export const asTagId = (value: string): TagId => value as TagId
export const asVaultId = (value: string): VaultId => value as VaultId
