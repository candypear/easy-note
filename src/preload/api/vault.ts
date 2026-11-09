import type { VaultApi } from '@shared/contracts/vault'
import { VaultChannels } from '@shared/contracts/vault'
import { invoke } from './invoke'

export const vaultApi: VaultApi = {
  suggestPath: () => invoke(VaultChannels.suggestPath),
  pickFolder: () => invoke(VaultChannels.pickFolder),
  open: (path) => invoke(VaultChannels.open, path),
  current: () => invoke(VaultChannels.current)
}
