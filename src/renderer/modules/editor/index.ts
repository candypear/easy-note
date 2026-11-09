import { watch } from 'vue'
import { asNoteId } from '@shared/types/brand'
import type { RendererModule } from '../../app/context'
import NoteEditor from './components/NoteEditor.vue'

export const editorModule: RendererModule = {
  id: 'editor',
  install(_app, ctx) {
    watch(
      () => ctx.workspace.currentNoteId,
      (noteId) => {
        if (noteId) ctx.shell.setWorkspaceView('editor')
      }
    )
    const openStartupNote = async (): Promise<void> => {
      if (ctx.workspace.currentNoteId) return
      const notes = await ctx.api.note.listAll()
      if (!notes.ok || notes.data.length === 0) return
      const settings = await ctx.api.settings.get()
      const recent = settings.ok ? settings.data.recentNoteIds : []
      const pick = notes.data.find((note) => recent.includes(note.id)) ?? notes.data[0]
      if (pick && !ctx.workspace.currentNoteId) ctx.workspace.openNote(pick.id)
    }

    void ctx.api.vault.current().then((vault) => {
      if (vault.ok && vault.data) void openStartupNote()
    })
    ctx.events.on('vault:changed', () => {
      ctx.workspace.closeNote()
      void openStartupNote()
    })

    ctx.shell.registry.workspace.registerView({
      id: 'editor',
      order: 10,
      component: NoteEditor
    })

    ctx.shortcuts.register('Ctrl+E', (event) => {
      if (!ctx.workspace.currentNoteId) return
      event.preventDefault()
      ctx.workspace.toggleSourceMode()
    })

    ctx.shortcuts.register('Ctrl+F', (event) => {
      if (!ctx.workspace.currentNoteId) return
      event.preventDefault()
      ctx.workspace.requestFind()
    })

    ctx.shortcuts.register('Ctrl+S', (event) => {
      if (!ctx.workspace.currentNoteId) return
      event.preventDefault()
      ctx.workspace.requestSave()
    })

    ctx.shortcuts.register('Ctrl+N', (event) => {
      if (!ctx.shell.state.vaultOpen) return
      event.preventDefault()
      void ctx.api.note.create(null).then((result) => {
        if (result.ok) ctx.workspace.openNote(asNoteId(result.data.id))
      })
    })
  }
}
