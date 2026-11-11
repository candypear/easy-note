// Base* 通用组件与 toast 的统一出口（barrel），提供聚合导入入口；
// 组件本身零业务依赖，可在任意模块复用。
export { default as BaseButton } from './button/BaseButton.vue'
export { default as BaseInput } from './input/BaseInput.vue'
export { default as BaseMenu } from './menu/BaseMenu.vue'
export type { MenuItem } from './menu/BaseMenu.vue'
export { default as BaseDialog } from './dialog/BaseDialog.vue'
export { default as BaseTooltip } from './tooltip/BaseTooltip.vue'
export { default as BaseTabs } from './tabs/BaseTabs.vue'
export { default as Icon } from './icons/Icon.vue'
export { default as ToastHost } from './toast/ToastHost.vue'
export { toast } from './toast/toast'
