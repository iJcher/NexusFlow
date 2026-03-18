<!--
  画布底部控制栏组件
-->
<template>
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-1000 pointer-events-none flex items-center gap-3">
    <!-- 添加节点按钮 -->
    <el-button 
      class="add-node-btn pointer-events-auto" 
      :icon="Plus" 
      @click="handleAddNode"
      :title="t('flowComponents.addNode')"
    />
    
    <!-- 缩放控制按钮组 -->
    <div>
      <el-button-group class="zoom-button-group pointer-events-auto">
        <el-button @click="handleZoomOut" :icon="ZoomOut" :title="t('flowComponents.zoomOut')" />
        <el-button class="zoom-display" disabled>
          <span class="text-3.25 font-500 font-mono">{{ zoomPercent }}%</span>
        </el-button>
        <el-button @click="handleResetZoom" :icon="FullScreen" :title="t('flowComponents.fitCanvas')" />
        <el-button @click="handleZoomIn" :icon="ZoomIn" :title="t('flowComponents.zoomIn')" />
      </el-button-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ZoomIn, ZoomOut, FullScreen, Plus } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';

interface Props {
  zoomPercent?: number;
}

const props = withDefaults(defineProps<Props>(), {
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
.add-node-btn {
  background: #1c2128;
  border: 1px solid #21262d;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  color: #00d4aa;
  padding: 10px 14px;
  min-width: 42px;
  transition: all 0.2s ease;
}

.add-node-btn:hover {
  background: #21262d;
  color: #00d4aa;
  border-color: #00d4aa;
}

.zoom-button-group {
  background: #1c2128;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  display: flex;
  border: 1px solid #21262d;
}

.zoom-button-group :deep(.el-button) {
  border: none;
  background: #1c2128;
  color: #8b949e;
  padding: 10px 14px;
  min-width: 42px;
  transition: all 0.2s ease;
  border-radius: 0;
}

.zoom-button-group :deep(.el-button:first-child) {
  border-radius: 8px 0 0 8px;
}

.zoom-button-group :deep(.el-button:last-child) {
  border-radius: 0 8px 8px 0;
}

.zoom-button-group :deep(.el-button:hover) {
  background: #21262d;
  color: #00d4aa;
}

.zoom-button-group :deep(.el-button + .el-button) {
  border-left: 1px solid #21262d;
}

.zoom-button-group :deep(.zoom-display) {
  cursor: default;
  min-width: 60px;
  padding: 10px 8px;
}

.zoom-button-group :deep(.zoom-display.is-disabled) {
  background: #1c2128;
  color: #8b949e;
  opacity: 1;
}
</style>
