<template>
  <el-button text class="theme-toggle" @click="toggleTheme">
    <el-icon :size="18">
      <Moon v-if="!isDark" />
      <Sunny v-else />
    </el-icon>
  </el-button>
</template>

<script setup lang="ts">
import { Moon, Sunny } from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'

const { isDark, toggleTheme } = useTheme()
</script>

<style scoped>
.theme-toggle {
  color: var(--nf-text-secondary) !important;
  padding: 6px !important;
  border-radius: 8px !important;
  transition: all 0.15s ease !important;
}

.theme-toggle:hover {
  color: var(--nf-accent) !important;
  background-color: var(--nf-accent-muted) !important;
}
</style>
