<template>
  <div class="widget-node start-widget">
    <div class="widget-header">
      <el-icon :size="16" class="widget-icon"><VideoPlay /></el-icon>
      <span class="widget-title">{{ displayName }}</span>
    </div>
    <p class="widget-desc">{{ description }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, type Ref } from 'vue'
import { VideoPlay } from '@element-plus/icons-vue'

const nodeData = inject<Ref<Record<string, any>>>('nodeData')!

const displayName = computed(() => nodeData.value.displayName || 'Start')
const description = computed(() => nodeData.value.description || 'Flow entry point')
</script>

<style scoped>
.start-widget {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.widget-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.widget-icon {
  color: var(--nf-text-secondary, #71717a);
}

.widget-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--nf-text-primary, #fafafa);
  line-height: 1.4;
}

.widget-desc {
  margin: 0;
  font-size: 11px;
  color: var(--nf-text-muted, #a1a1aa);
  line-height: 1.4;
}
</style>
