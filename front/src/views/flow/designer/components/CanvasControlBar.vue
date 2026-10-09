<script setup lang="ts">
import { FullScreen, ZoomIn, ZoomOut } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

interface Props {
  zoomPercent?: number
}

withDefaults(defineProps<Props>(), {
  zoomPercent: 100,
})

const emit = defineEmits<{
  zoomIn: []
  zoomOut: []
  resetZoom: []
}>()

const { t } = useI18n()

const handleZoomIn = () => emit('zoomIn')
const handleZoomOut = () => emit('zoomOut')
const handleResetZoom = () => emit('resetZoom')
</script>

<template>
  <div class="canvas-control-bar">
    <div class="zoom-group">
      <button type="button" class="ctrl-btn" :title="t('flowComponents.zoomOut')" @click="handleZoomOut">
        <ZoomOut class="h-4 w-4" />
      </button>
      <span class="zoom-label">{{ zoomPercent }}%</span>
      <button type="button" class="ctrl-btn" :title="t('flowComponents.fitCanvas')" @click="handleResetZoom">
        <FullScreen class="h-3.5 w-3.5" />
      </button>
      <button type="button" class="ctrl-btn" :title="t('flowComponents.zoomIn')" @click="handleZoomIn">
        <ZoomIn class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.canvas-control-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  align-items: center;
  pointer-events: none;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #5a6a7c;
  cursor: pointer;
  transition: color 0.2s;
  padding: 0;
  pointer-events: auto;
}
.ctrl-btn:hover {
  color: var(--nf-accent);
}

.zoom-group {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 2px 6px;
  background: rgba(8, 11, 16, 0.9);
  border: 1px solid #1e2733;
  border-radius: 4px;
  pointer-events: auto;
  backdrop-filter: blur(12px);
}

.zoom-label {
  min-width: 48px;
  text-align: center;
  font-family: var(--nf-font-mono);
  font-size: 11px;
  font-weight: 400;
  color: #5a6a7c;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  user-select: none;
}
</style>
