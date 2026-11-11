// 双链模块桥接：把 LinkApi 调用转发到对应 IPC 通道。
import type { LinkApi } from '@shared/contracts/link'
import { LinkChannels } from '@shared/contracts/link'
import { invoke } from './invoke'

export const linkApi: LinkApi = {
  backlinks: (noteId) => invoke(LinkChannels.backlinks, noteId),
  unlinked: (noteId) => invoke(LinkChannels.unlinked, noteId),
  convertMention: (request) => invoke(LinkChannels.convertMention, request),
  convertAll: (noteId) => invoke(LinkChannels.convertAll, noteId),
  resolveTarget: (title) => invoke(LinkChannels.resolveTarget, title),
  relink: (oldTitle, newTitle) => invoke(LinkChannels.relink, { oldTitle, newTitle })
}
