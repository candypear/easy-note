<script setup lang="ts">
import { useContext } from '../../../app/providers'

const props = defineProps<{
  visible: boolean
  onLoadDisk(): void
  onKeepCurrent(): void
}>()

const ctx = useContext()
const { t } = ctx.i18n
</script>

<template>
  <div v-if="props.visible" class="external-banner">
    <span>{{ t('editor.externalChange') }}</span>
    <div class="actions">
      <button type="button" class="banner-button" @click="props.onLoadDisk()">
        {{ t('editor.loadDisk') }}
      </button>
      <button type="button" class="banner-button" @click="props.onKeepCurrent()">
        {{ t('editor.keepCurrent') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.external-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 0 12px;
  background: color-mix(in srgb, var(--warning) 8%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
  font-size: 12px;
  color: var(--text-primary);
  flex: none;
}

.actions {
  display: flex;
  gap: 8px;
}

.banner-button {
  font-size: 12px;
  color: var(--accent);
  padding: 2px 4px;
}

.banner-button:hover {
  text-decoration: underline;
}
</style>
