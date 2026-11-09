<script setup lang="ts">
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
