<script setup lang="ts">
// 根组件：只承载应用外壳 AppShell，不含业务逻辑；
// 全局样式在下方 style 块按 字体→令牌→主题→基础 的依赖顺序引入。
import AppShell from './modules/shell/components/AppShell.vue'
</script>

<template>
  <AppShell />
</template>

<style>
@import './styles/fonts.css';
@import './styles/tokens.css';
@import './styles/themes.css';
@import './styles/base.css';
</style>
