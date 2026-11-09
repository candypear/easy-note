<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useContext } from '../../../app/providers'
import TopBar from './TopBar.vue'
import SidebarHost from './SidebarHost.vue'
import WorkspaceHost from './WorkspaceHost.vue'
import RightPanelHost from './RightPanelHost.vue'
import StatusBar from './StatusBar.vue'
import VaultWelcome from './VaultWelcome.vue'
import ToastHost from '../../../ui/toast/ToastHost.vue'

const ctx = useContext()
const state = ctx.shell.state
const dragging = ref<'left' | 'right' | null>(null)
const overlayComponent = computed(() =>
  state.overlay ? ctx.shell.registry.overlay.get(state.overlay) : undefined
)

function onPointerMove(event: PointerEvent): void {
  if (dragging.value === 'left') ctx.shell.setSidebarWidth(event.clientX)
  if (dragging.value === 'right') ctx.shell.setRightWidth(window.innerWidth - event.clientX)
}

function persist(): void {
  void ctx.api.settings.set({
    sidebarWidth: state.sidebarWidth,
    rightWidth: state.rightWidth,
    sidebarOpen: state.sidebarOpen,
    rightOpen: state.rightOpen
  })
}

function stopDrag(): void {
  if (!dragging.value) return
  dragging.value = null
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  window.removeEventListener('pointermove', onPointerMove)
  persist()
}

function startDrag(side: 'left' | 'right', event: PointerEvent): void {
  event.preventDefault()
  dragging.value = side
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', stopDrag, { once: true })
}

onBeforeUnmount(stopDrag)
</script>

<template>
  <div v-if="!state.booted" class="boot" />
  <VaultWelcome v-else-if="!state.vaultOpen" />
  <div v-else class="app-shell">
    <TopBar />
    <div class="body">
      <div v-if="state.sidebarOpen" class="pane" :style="{ width: `${state.sidebarWidth}px` }">
        <SidebarHost />
      </div>
      <div
        v-if="state.sidebarOpen"
        class="resizer"
        role="separator"
        aria-orientation="vertical"
        @pointerdown="startDrag('left', $event)"
      />
      <WorkspaceHost />
      <div
        v-if="state.rightOpen"
        class="resizer"
        role="separator"
        aria-orientation="vertical"
        @pointerdown="startDrag('right', $event)"
      />
      <div v-if="state.rightOpen" class="pane" :style="{ width: `${state.rightWidth}px` }">
        <RightPanelHost />
      </div>
    </div>
    <StatusBar />
    <component :is="overlayComponent" v-if="overlayComponent" />
    <ToastHost />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  transition: color var(--duration-theme) ease-out;
}

.body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.pane {
  flex: none;
  min-width: 0;
  height: 100%;
}

.resizer {
  width: 8px;
  margin: 0 -4px;
  z-index: 2;
  cursor: col-resize;
  flex: none;
}

.resizer:hover {
  background: var(--bg-selected);
}

.boot {
  height: 100vh;
  background: var(--bg-app);
}
</style>
