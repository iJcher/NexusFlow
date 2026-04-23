<template>
  <div class="canvas-control-bar">
    <div class="zoom-group">
      <button type="button" class="ctrl-btn" @click="handleZoomOut" :title="t('flowComponents.zoomOut')">
        <ZoomOut class="w-4 h-4" />
      </button>
      <span class="zoom-label">{{ zoomPercent }}%</span>
      <button type="button" class="ctrl-btn" @click="handleResetZoom" :title="t('flowComponents.fitCanvas')">
        <FullScreen class="w-3.5 h-3.5" />
      </button>
      <button type="button" class="ctrl-btn" @click="handleZoomIn" :title="t('flowComponents.zoomIn')">
        <ZoomIn class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ZoomIn, ZoomOut, FullScreen } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';

interface Props {
  zoomPercent?: number;
}

withDefaults(defineProps<Props>(), {
  zoomPercent: 100
});

const emit = defineEmits<{
  zoomIn: [];
  zoomOut: [];
  resetZoom: [];
}>();

const { t } = useI18n();

const handleZoomIn = () => emit('zoomIn');
const handleZoomOut = () => emit('zoomOut');
const handleResetZoom = () => emit('resetZoom');
</script>

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
  color: #5A6A7C;
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
  border: 1px solid #1E2733;
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
  color: #5A6A7C;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  user-select: none;
}
</style>
