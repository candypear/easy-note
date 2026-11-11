<script setup lang="ts">
// 选库欢迎页：未打开笔记库时替代主布局；默认建议路径来自后端，
// 可经系统对话框换目录，打开成功后直接写 shell 状态切入主界面。
import { computed, onMounted, ref } from 'vue'
import { useContext } from '../../../app/providers'
import BaseButton from '../../../ui/button/BaseButton.vue'
import BaseInput from '../../../ui/input/BaseInput.vue'

const ctx = useContext()
const { t } = ctx.i18n
const path = ref('')
const error = ref('')
const busy = ref(false)

onMounted(async () => {
  const result = await ctx.api.vault.suggestPath()
  if (result.ok) path.value = result.data
})

async function browse(): Promise<void> {
  const result = await ctx.api.vault.pickFolder()
  if (result.ok && result.data) path.value = result.data
}

const title = computed(() => (ctx.shell.state.vaultPath ? t('vault.open') : t('vault.create')))

async function submit(): Promise<void> {
  const target = path.value.trim()
  // busy 防重复提交；失败仅提示换路径，成功后同步库信息使外壳切换到主布局
  if (!target || busy.value) return
  busy.value = true
  error.value = ''
  const result = await ctx.api.vault.open(target)
  busy.value = false
  if (!result.ok) {
    error.value = t('vault.error')
    return
  }
  ctx.shell.state.vaultOpen = true
  ctx.shell.state.vaultPath = result.data.path
  ctx.shell.state.vaultName = result.data.name
}
</script>

<template>
  <div class="vault-welcome">
    <div class="card">
      <h1>EasyNote</h1>
      <p class="hint">{{ t('vault.title') }}</p>
      <div class="path-row">
        <span class="path">{{ path || '…' }}</span>
        <BaseButton variant="text" @click="browse">{{ t('vault.change') }}</BaseButton>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <BaseButton variant="primary" :disabled="busy || !path" @click="submit">
          {{ title }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vault-welcome {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  height: 100vh;
  padding-top: 22vh;
  background: var(--bg-app);
}

.card {
  width: 360px;
}

h1 {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
}

.hint {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--text-secondary);
}

.path-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-input);
}

.path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.error {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--danger);
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
