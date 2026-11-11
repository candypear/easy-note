<script setup lang="ts">
// 工作区宿主：按 shell.workspaceView 在注册的视图（编辑器/图谱）间切换，
// id 无效时回退到第一个注册视图，避免状态与注册表不一致导致空白。
import { computed } from 'vue'
import { useContext } from '../../../app/providers'

const ctx = useContext()
const views = ctx.shell.registry.workspace.views()
const active = computed(
  () => views.find((view) => view.id === ctx.shell.state.workspaceView) ?? views[0]
)
</script>

<template>
  <section class="workspace">
    <component :is="active?.component" v-if="active" />
  </section>
</template>

<style scoped>
.workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: var(--bg-app);
  overflow: hidden;
}
</style>
