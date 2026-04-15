<template>
  <div class="flow-editor-page">
    <header class="editor-header">
      <div class="header-left">
        <el-button @click="closeWindow" :icon="Close" text class="close-btn" />
        <el-divider direction="vertical" class="header-divider" />
        <span class="header-title">{{ flowTitle }}</span>
      </div>
      
      <div class="header-center">
        <span class="flow-name-badge">{{ currentFlowName || t('flowDesigner.unnamedFlow') }}</span>
      </div>

      <div class="header-right">
        <el-button 
          v-if="flowId"
          @click="openChatTest" 
          type="success" 
          :icon="VideoPlay"
          plain
          size="small"
        >
          {{ t('flowDesigner.run') }}
        </el-button>
        <FlowExecutionLogDropdown
          v-if="flowId"
          :flow-id="flowId"
        />
        <el-button @click="persistence.saveFlow()" type="primary" :icon="DocumentAdd" size="small">
          {{ t('flowDesigner.save') }}
        </el-button>
      </div>
    </header>

    <div id="lf-container" ref="lfContainer" class="canvas-area" @contextmenu.prevent="(e) => menus.handleCanvasContextMenu(e, getLf())"></div>

    <CanvasControlBar 
      :zoom-percent="currentZoomPercent"
      @add-node="handleOpenAddNodeDialog"
      @zoom-in="zoomIn"
      @zoom-out="zoomOut"
      @reset-zoom="resetZoom"
    />

    <FlowRightMenuComponent
      ref="rightMenuRef"
      :visible="menus.contextMenuVisible.value"
      :position="menus.contextMenuPosition.value"
      :nodes="availableNodes"
      @close="menus.closeContextMenu(rightMenuRef)"
      @select-node="addNodeAtPosition"
    />

    <NodeContextMenu
      :visible="menus.nodeContextMenuVisible.value"
      :position="menus.nodeContextMenuPosition.value"
      :target-type="menus.contextMenuTargetType.value"
      :target-id="menus.contextMenuTargetId.value"
      @close="menus.closeNodeContextMenu()"
      @delete="(type, id) => menus.handleDeleteTarget(type, id, getLf())"
    />

    <NodePalette
      :nodes="availableNodes"
      :canvas-mode="canvasMode"
      @add-node="addNodeFromPalette"
      @group="groupSelectedNodes"
      @mode-change="setCanvasMode"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { DocumentAdd, Close, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useFlowDesignerStore } from '@/stores/flowDesigner'

import FlowRightMenuComponent from './components/FlowRightMenuComponent.vue'
import CanvasControlBar from './components/CanvasControlBar.vue'
import NodeContextMenu from './components/NodeContextMenu.vue'
import FlowExecutionLogDropdown from './components/FlowExecutionLogDropdown.vue'
import NodePalette from './components/NodePalette.vue'

import { useDesignerMenus } from '@/composables/useDesignerMenus'
import { useLogicFlowSetup } from '@/composables/useLogicFlowSetup'
import { useFlowPersistence } from '@/composables/useFlowPersistence'
import { NodeBaseView } from '@/types/flow-designer/NodeBaseView'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const lfContainer = ref<HTMLElement | null>(null)
const rightMenuRef = ref<InstanceType<typeof FlowRightMenuComponent> | null>(null)
const flowStore = useFlowDesignerStore()

const flowType = computed(() => route.params.flowType as string)
const flowId = computed(() => route.params.id ? Number(route.params.id) : null)

const flowTitle = computed(() => {
  const titles: Record<string, string> = {
    logic: t('flowDesigner.logicFlowTitle'),
    ai: t('flowDesigner.aiFlowTitle'),
    approval: t('flowDesigner.approvalFlowTitle'),
  }
  return titles[flowType.value] || t('flowDesigner.title')
})

const menus = useDesignerMenus()

const {
  currentZoomPercent,
  availableNodes,
  currentFlowName,
  canvasMode,
  initLogicFlow,
  addNodeAtPosition,
  groupSelectedNodes,
  setCanvasMode,
  zoomIn,
  zoomOut,
  resetZoom,
  getLf,
} = useLogicFlowSetup(
  lfContainer,
  flowType,
  flowId,
  menus,
  async (id: number) => persistence.loadFlowData(id),
)

const persistence = useFlowPersistence(flowType, flowId, currentFlowName, getLf)

const addNodeFromPalette = (nodeType: string) => {
  const lf = getLf()
  if (!lf || !lfContainer.value) return
  const rect = lfContainer.value.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const point = lf.getPointByClient(centerX, centerY)
  const offsetX = (Math.random() - 0.5) * 120
  const offsetY = (Math.random() - 0.5) * 80
  menus.clickPosition.value = {
    x: point.canvasOverlayPosition.x + offsetX,
    y: point.canvasOverlayPosition.y + offsetY,
  }
  addNodeAtPosition(nodeType)
}

const closeWindow = () => router.back()

const openChatTest = () => {
  if (!flowId.value) {
    ElMessage.warning(t('flowDesigner.flowIdNotExist'))
    return
  }
  router.push({ name: 'flowChatTest', params: { flowId: String(flowId.value) } })
}

const handleOpenAddNodeDialog = () => {
  const centerX = window.innerWidth / 2
  const centerY = window.innerHeight / 2
  const lf = getLf()

  if (lf && lfContainer.value) {
    const rect = lfContainer.value.getBoundingClientRect()
    const bottomControlBarHeight = 64
    const randomOffset = Math.floor(Math.random() * 101) + 100
    const screenY = rect.bottom - bottomControlBarHeight - randomOffset
    const screenX = rect.left + rect.width / 2
    const point = lf.getPointByClient(screenX, screenY)
    menus.clickPosition.value = {
      x: point.canvasOverlayPosition.x,
      y: point.canvasOverlayPosition.y,
    }
  }

  setTimeout(() => {
    rightMenuRef.value?.openSelectorAt({ x: centerX - 210, y: centerY - 250 })
  })
}

const closeAllMenusFn = () => menus.closeAllMenus(rightMenuRef.value)

const handleKeydown = (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

  if (e.key === 'v' || e.key === 'V') {
    setCanvasMode('select')
  } else if (e.key === 'h' || e.key === 'H') {
    setCanvasMode('move')
  }
}

onMounted(() => {
  const flowIdString = flowId.value ? flowId.value.toString() : `temp-${Date.now()}`
  flowStore.initFlow(flowIdString, currentFlowName.value || t('flowDesigner.unnamedFlow'))
  initLogicFlow()
  document.addEventListener('click', closeAllMenusFn)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  NodeBaseView.clearAllWidgets()
  const lf = getLf()
  if (lf) {
    lf.destroy()
  }
  document.removeEventListener('click', closeAllMenusFn)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
/* ── Page shell ── */
.flow-editor-page {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--nf-bg-base);
  overflow: hidden;
}

/* ── Header (52px, ref: matrix-number) ── */
.editor-header {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--nf-border);
  background: var(--nf-bg-card);
  flex-shrink: 0;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.close-btn {
  color: var(--nf-text-secondary);
}

.header-divider {
  margin: 0 4px;
}

.header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--nf-text-primary);
}

.flow-name-badge {
  font-size: 13px;
  font-weight: 500;
  color: var(--nf-text-secondary);
  padding: 4px 14px;
  background: var(--nf-bg-elevated);
  border-radius: 6px;
  border: 1px solid var(--nf-border);
}

/* ── Canvas ── */
.canvas-area {
  flex: 1;
  position: relative;
  background: var(--nf-bg-base);
}

/* ── Node styling on canvas ── */
:deep(.dify-node),
:deep(.widget-container) {
  display: flex;
  flex-direction: column;
  background: var(--nf-bg-card);
  border: 1px solid var(--nf-border);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}

:deep(.dify-node) {
  padding: 12px;
}

:deep(.dify-node:hover),
:deep(.widget-container:hover) {
  border-color: var(--nf-accent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

:deep(.lf-node-selected .dify-node),
:deep(.lf-node-selected .widget-container) {
  border-color: var(--nf-accent);
  box-shadow: 0 0 0 2px var(--nf-accent-muted);
}

:deep(.node-header) {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

:deep(.node-icon) {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  flex-shrink: 0;
  font-size: 15px;
  color: var(--nf-text-secondary);
  background: var(--nf-bg-elevated);
  border: 1px solid var(--nf-border);
}

:deep(.node-name) {
  font-size: 13px;
  font-weight: 600;
  color: var(--nf-text-primary);
  line-height: 20px;
}

:deep(.node-info) {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
}

:deep(.info-text) {
  font-size: 12px;
  color: var(--nf-text-muted);
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.lf-anchor) {
  width: 8px;
  height: 8px;
  background: var(--nf-bg-card);
  border: 2px solid var(--nf-accent);
  border-radius: 50%;
}

:deep(.lf-anchor:hover) {
  width: 10px;
  height: 10px;
  background: var(--nf-accent);
}

:deep(.lf-arrow) { fill: var(--nf-text-muted); }
:deep(.lf-edge-selected .lf-arrow) { fill: var(--nf-accent); }

/* ── Widget compact overrides ── */
:deep(.widget-container .el-select) {
  --el-select-input-font-size: 11px;
}
:deep(.widget-container .el-input__inner) {
  font-size: 11px;
  height: 26px;
  line-height: 26px;
}
:deep(.widget-container .el-input--small .el-input__wrapper) {
  padding: 0 7px;
}
:deep(.widget-container .el-textarea__inner) {
  font-size: 11px;
  min-height: 40px !important;
}
:deep(.widget-container .el-input-number--small) {
  width: 80px;
}
:deep(.widget-container .el-select__wrapper) {
  min-height: 26px;
  font-size: 11px;
}
:deep(.widget-container .el-select__placeholder) {
  font-size: 11px;
}
:deep(.widget-container .el-slider__runway) {
  height: 4px;
}
:deep(.widget-container .el-slider__button) {
  width: 12px;
  height: 12px;
}

/* ── Select mode: let HTML inside foreignObject receive pointer events ── */
.canvas-area :deep(.select-mode .lf-node-content) {
  pointer-events: none;
}
.canvas-area :deep(.select-mode foreignObject) {
  pointer-events: all;
}
.canvas-area :deep(.select-mode .widget-container) {
  pointer-events: all;
  cursor: text;
}
</style>

<style>
.input-dialog .el-dialog__header {
  background: var(--nf-bg-muted);
  color: var(--nf-text-primary);
}

.input-dialog .el-dialog__title { color: var(--nf-text-primary); }

.session-dialog .el-dialog__header {
  background: var(--nf-bg-muted);
  color: var(--nf-text-primary);
}

.session-dialog .el-dialog__title { color: var(--nf-text-primary); }

.input-dialog.el-dialog,
.session-dialog.el-dialog {
  z-index: 2000 !important;
}

.el-overlay.is-message-box {
  z-index: 1999 !important;
}
</style>
