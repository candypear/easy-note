<script setup lang="ts">
// 通用上下文菜单：受控组件（open/x/y/items 全由父级传入），选中/关闭只发事件；
// Teleport 到 body 按视口坐标定位，打开期间捕获全局点击与 Esc 实现"点外部即关"。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from '../icons/Icon.vue'

export interface MenuItem {
  id: string
  label: string
  shortcut?: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  checked?: boolean
  children?: MenuItem[]
  separator?: boolean
}

const props = defineProps<{
  open: boolean
  x: number
  y: number
  items: MenuItem[]
}>()

const emit = defineEmits<{
  select: [id: string]
  close: []
}>()

const root = ref<HTMLElement | null>(null)
// 当前展开子菜单的父项 id；同一时刻只展开一个子菜单
const submenu = ref<string | null>(null)

const position = computed(() => {
  // 只做视口边缘钳制（留 8px），不做翻转；SSR/测试环境无 window 时用默认分辨率
  const maxX = typeof window === 'undefined' ? 1920 : window.innerWidth
  const maxY = typeof window === 'undefined' ? 1080 : window.innerHeight
  return {
    left: `${Math.max(8, Math.min(props.x, maxX - 8))}px`,
    top: `${Math.max(8, Math.min(props.y, maxY - 8))}px`
  }
})

function onDocumentPointer(event: PointerEvent): void {
  // 点击落在菜单（含子菜单）之外才关闭；捕获阶段监听，先于业务点击处理
  if (!(event.target instanceof Node)) return
  if (root.value?.contains(event.target)) return
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    // 阻止冒泡，避免 Esc 关菜单的同时触发全局快捷键
    event.stopPropagation()
    emit('close')
  }
}

// 监听随 open 开关挂/卸，关闭时顺带收起子菜单，避免常驻监听与状态残留
watch(
  () => props.open,
  (open) => {
    if (open) {
      document.addEventListener('pointerdown', onDocumentPointer, true)
      document.addEventListener('keydown', onKeydown, true)
    } else {
      document.removeEventListener('pointerdown', onDocumentPointer, true)
      document.removeEventListener('keydown', onKeydown, true)
      submenu.value = null
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer, true)
  document.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.open"
      ref="root"
      class="base-menu no-drag"
      :style="position"
      role="menu"
    >
      <template v-for="item in props.items" :key="item.id">
        <div v-if="item.separator" class="separator" />
        <button
          v-else
          class="menu-item"
          :class="{ danger: item.danger, disabled: item.disabled }"
          type="button"
          role="menuitem"
          :disabled="item.disabled"
          @mouseenter="submenu = item.children ? item.id : null"
          @click="!item.children && !item.disabled && emit('select', item.id)"
        >
          <span class="check">
            <Icon v-if="item.checked" name="check" :size="14" />
          </span>
          <Icon v-if="item.icon" :name="item.icon" :size="16" />
          <span class="label">{{ item.label }}</span>
          <span v-if="item.shortcut" class="shortcut">{{ item.shortcut }}</span>
          <Icon v-if="item.children" name="chevronRight" :size="14" class="submenu-arrow" />
        </button>
        <div
          v-if="item.children && submenu === item.id"
          class="submenu"
          role="menu"
        >
          <button
            v-for="child in item.children"
            :key="child.id"
            class="menu-item"
            :class="{ danger: child.danger }"
            type="button"
            role="menuitem"
            @click="emit('select', child.id)"
          >
            <span class="check" />
            <Icon v-if="child.icon" :name="child.icon" :size="16" />
            <span class="label">{{ child.label }}</span>
          </button>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.base-menu {
  position: fixed;
  z-index: 50;
  min-width: 180px;
  max-width: 320px;
  padding: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-menu);
  box-shadow: var(--shadow-menu);
}

.menu-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border-radius: var(--radius-input);
  font-size: var(--font-size-ui);
  text-align: left;
  color: var(--text-menu);
}

.menu-item:hover:not(:disabled) {
  background: var(--bg-hover);
}

.menu-item.danger {
  color: var(--danger);
}

.menu-item.danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}

.menu-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.check {
  display: inline-flex;
  width: 14px;
  flex: none;
  color: var(--accent);
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shortcut {
  color: var(--text-tertiary);
  font-size: var(--font-size-meta);
}

.submenu {
  position: absolute;
  left: calc(100% + 4px);
  top: 0;
  min-width: 180px;
  padding: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-menu);
  box-shadow: var(--shadow-menu);
}

.separator {
  height: 1px;
  margin: 4px 0;
  background: var(--border);
}
</style>
