// 编辑器渲染模块入口：注册编辑器工作区视图、启动时自动打开笔记，
// 并绑定 Ctrl+E/F/S/N 等全局快捷键到 workspace 状态。
import { watch } from 'vue'
import { asNoteId } from '@shared/types/brand'
import type { RendererModule } from '../../app/context'
import NoteEditor from './components/NoteEditor.vue'

export const editorModule: RendererModule = {
  id: 'editor',
  install(_app, ctx) {
    // 一旦有笔记被打开，工作区自动切换到编辑器视图
    watch(
      () => ctx.workspace.currentNoteId,
      (noteId) => {
        if (noteId) ctx.shell.setWorkspaceView('editor')
      }
    )
    // 启动时优先恢复最近打开的笔记，否则回退到列表中的第一篇；
    // 末尾再次检查 currentNoteId，避免异步等待期间用户已手动打开笔记造成覆盖。
    const openStartupNote = async (): Promise<void> => {
      if (ctx.workspace.currentNoteId) return
      const notes = await ctx.api.note.listAll()
      if (!notes.ok || notes.data.length === 0) return
      const settings = await ctx.api.settings.get()
      const recent = settings.ok ? settings.data.recentNoteIds : []
      const pick = notes.data.find((note) => recent.includes(note.id)) ?? notes.data[0]
      if (pick && !ctx.workspace.currentNoteId) ctx.workspace.openNote(pick.id)
    }

    // 仅在已有打开的 vault 时才尝试恢复笔记
    void ctx.api.vault.current().then((vault) => {
      if (vault.ok && vault.data) void openStartupNote()
    })
    // 切换 vault 后旧笔记不再有效：先关闭当前笔记，再按新 vault 重新选一篇
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
