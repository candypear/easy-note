import type { NoteId } from '../types/brand'

export interface NoteSummary {
  id: NoteId
  title: string
  path: string
  folderPath: string
  modifiedAt: string
}

export interface NoteContent extends NoteSummary {
  content: string
}
