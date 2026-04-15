<template>
  <div class="canvas-control-bar">
    <button type="button" class="ctrl-btn add-btn" @click="handleAddNode" :title="t('flowComponents.addNode')">
      <Plus class="w-4 h-4" />
    </button>
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
import { ZoomIn, ZoomOut, FullScreen, Plus } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';

interface Props {
  zoomPercent?: number;
}

withDefaults(defineProps<Props>(), {
  zoomPercent: 100
});

const emit = defineEmits<{
  addNode: [];
  zoomIn: [];
  zoomOut: [];
  resetZoom: [];
}>();

const { t } = useI18n();

const handleAddNode = () => emit('addNode');
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
  gap: 8px;
  pointer-events: none;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--nf-text-secondary);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  padding: 0;
  pointer-events: auto;
}

.ctrl-btn:hover {
  background: var(--nf-bg-elevated);
  color: var(--nf-text-primary);
}

.add-btn {
  background: var(--nf-bg-card);
  border: 1px solid var(--nf-border);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  width: 36px;
  height: 36px;
}

.add-btn:hover {
  border-color: var(--nf-accent);
  color: var(--nf-accent);
}

.zoom-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: var(--nf-bg-card);
  border: 1px solid var(--nf-border);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  pointer-events: auto;
}

.zoom-label {
  min-width: 42px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--nf-text-secondary);
  font-variant-numeric: tabular-nums;
  user-select: none;
}
</style>
