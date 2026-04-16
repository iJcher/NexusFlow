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

    <div class="canvas-area" ref="canvasRef" @contextmenu.prevent="handleCanvasContextMenu">
      <VueFlow
        id="nexusflow-canvas"
        :selection-on-drag="isGroupSelecting"
        @node-context-menu="handleNodeContextMenu"
        @edge-context-menu="handleEdgeContextMenu"
        class="vue-flow-canvas"
      >
        <Background :variant="BackgroundVariant.Dots" :gap="20" :size="2" />
        <MiniMap position="bottom-right" />

        <template #node-start="nodeProps">
          <StartVFNode v-bind="nodeProps" />
        </template>
        <template #node-llm="nodeProps">
          <LLMVFNode v-bind="nodeProps" />
        </template>
        <template #node-reply="nodeProps">
          <ReplyVFNode v-bind="nodeProps" />
        </template>
        <template #node-condition="nodeProps">
          <ConditionVFNode v-bind="nodeProps" />
        </template>
        <template #node-assign="nodeProps">
          <AssignVFNode v-bind="nodeProps" />
        </template>
        <template #node-jscode="nodeProps">
          <JSCodeVFNode v-bind="nodeProps" />
        </template>
        <template #node-http="nodeProps">
          <HttpVFNode v-bind="nodeProps" />
        </template>
        <template #node-result="nodeProps">
          <ResultVFNode v-bind="nodeProps" />
        </template>
      </VueFlow>
    </div>

    <CanvasControlBar 
      :zoom-percent="currentZoomPercent"
      @zoom-in="zoomIn"
      @zoom-out="zoomOut"
      @reset-zoom="resetZoom"
    />

    <FlowRightMenuComponent
      ref="rightMenuRef"
      :visible="contextMenuVisible"
      :position="contextMenuPosition"
      :nodes="availableNodes"
      @close="closeContextMenu"
      @select-node="handleAddNodeFromMenu"
    />

    <NodeContextMenu
      :visible="nodeContextMenuVisible"
      :position="nodeContextMenuPosition"
      :target-type="contextMenuTargetType"
      :target-id="contextMenuTargetId"
      @close="closeNodeContextMenu"
      @delete="handleDeleteTarget"
    />

    <NodePalette
      :nodes="availableNodes"
      :canvas-mode="canvasMode"
      :is-group-selecting="isGroupSelecting"
      @add-node="addNodeFromPalette"
      @group="toggleGroupSelect"
      @mode-change="setCanvasMode"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { DocumentAdd, Close, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { VueFlow } from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/minimap/dist/style.css'

import { useFlowDesignerStore } from '@/stores/flowDesigner'

import FlowRightMenuComponent from './components/FlowRightMenuComponent.vue'
import CanvasControlBar from './components/CanvasControlBar.vue'
import NodeContextMenu from './components/NodeContextMenu.vue'
import FlowExecutionLogDropdown from './components/FlowExecutionLogDropdown.vue'
import NodePalette from './components/NodePalette.vue'

import StartVFNode from './vf-nodes/StartVFNode.vue'
import LLMVFNode from './vf-nodes/LLMVFNode.vue'
import ReplyVFNode from './vf-nodes/ReplyVFNode.vue'
import ConditionVFNode from './vf-nodes/ConditionVFNode.vue'
import AssignVFNode from './vf-nodes/AssignVFNode.vue'
import JSCodeVFNode from './vf-nodes/JSCodeVFNode.vue'
import HttpVFNode from './vf-nodes/HttpVFNode.vue'
import ResultVFNode from './vf-nodes/ResultVFNode.vue'

import { useVueFlowSetup } from '@/composables/useVueFlowSetup'
import { useFlowPersistenceVF } from '@/composables/useFlowPersistenceVF'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const canvasRef = ref<HTMLElement | null>(null)
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

const {
  nodes,
  edges,
  canvasMode,
  currentZoomPercent,
  availableNodes,
  currentFlowName,
  initCanvas,
  addNodeAtCenter,
  addNodeAndConnect,
  deleteNode,
  deleteEdge,
  zoomIn,
  zoomOut,
  resetZoom,
  setCanvasMode,
  isGroupSelecting,
  toggleGroupSelect,
  getGraphData,
  renderGraphData,
  project,
} = useVueFlowSetup(
  flowType,
  flowId,
  async (id: number) => persistence.loadFlowData(id),
)

const persistence = useFlowPersistenceVF(
  flowType,
  flowId,
  currentFlowName,
  getGraphData,
  renderGraphData,
)

provide('canvasMode', canvasMode)
provide('availableNodes', availableNodes)
provide('addNodeAndConnect', addNodeAndConnect)

// Context menu state
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const clickCanvasPosition = ref({ x: 0, y: 0 })
const nodeContextMenuVisible = ref(false)
const nodeContextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuTargetType = ref<'node' | 'edge' | null>(null)
const contextMenuTargetId = ref<string | null>(null)

const handleCanvasContextMenu = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (target.closest('.vue-flow__node') || target.closest('.vue-flow__edge')) return

  contextMenuPosition.value = { x: event.clientX, y: event.clientY }

  if (canvasRef.value) {
    const rect = canvasRef.value.getBoundingClientRect()
    const projected = project({ x: event.clientX - rect.left, y: event.clientY - rect.top })
    clickCanvasPosition.value = { x: projected.x, y: projected.y }
  }

  contextMenuVisible.value = true
  event.stopPropagation()
}

const handleNodeContextMenu = ({ event, node }: { event: MouseEvent | TouchEvent, node: any }) => {
  event.preventDefault()
  const pos = 'clientX' in event ? { x: event.clientX, y: event.clientY } : { x: 0, y: 0 }
  nodeContextMenuPosition.value = pos
  contextMenuTargetType.value = 'node'
  contextMenuTargetId.value = node.id
  nodeContextMenuVisible.value = true
  contextMenuVisible.value = false
}

const handleEdgeContextMenu = ({ event, edge }: { event: MouseEvent | TouchEvent, edge: any }) => {
  event.preventDefault()
  const pos = 'clientX' in event ? { x: event.clientX, y: event.clientY } : { x: 0, y: 0 }
  nodeContextMenuPosition.value = pos
  contextMenuTargetType.value = 'edge'
  contextMenuTargetId.value = edge.id
  nodeContextMenuVisible.value = true
  contextMenuVisible.value = false
}

const closeContextMenu = () => {
  contextMenuVisible.value = false
  rightMenuRef.value?.closeSelector()
}

const closeNodeContextMenu = () => {
  nodeContextMenuVisible.value = false
  contextMenuTargetType.value = null
  contextMenuTargetId.value = null
}

const handleDeleteTarget = (targetType: 'node' | 'edge', targetId: string) => {
  if (targetType === 'node') {
    deleteNode(targetId)
    ElMessage.success(t('flowDesigner.nodeDeleted'))
  } else if (targetType === 'edge') {
    deleteEdge(targetId)
    ElMessage.success(t('flowDesigner.edgeDeleted'))
  }
}

const handleAddNodeFromMenu = (nodeType: string) => {
  addNodeAtCenter(nodeType, clickCanvasPosition.value)
}

const addNodeFromPalette = (nodeType: string) => {
  if (!canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const centerX = rect.width / 2
  const centerY = rect.height / 2
  const projected = project({ x: centerX, y: centerY })
  const offsetX = (Math.random() - 0.5) * 120
  const offsetY = (Math.random() - 0.5) * 80
  addNodeAtCenter(nodeType, { x: projected.x + offsetX, y: projected.y + offsetY })
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

  if (canvasRef.value) {
    const rect = canvasRef.value.getBoundingClientRect()
    const projected = project({ x: rect.width / 2, y: rect.height / 2 })
    clickCanvasPosition.value = { x: projected.x, y: projected.y }
  }

  setTimeout(() => {
    rightMenuRef.value?.openSelectorAt({ x: centerX - 210, y: centerY - 250 })
  })
}

const closeAllMenusFn = () => {
  closeContextMenu()
  closeNodeContextMenu()
}

onMounted(() => {
  const flowIdString = flowId.value ? flowId.value.toString() : `temp-${Date.now()}`
  flowStore.initFlow(flowIdString, currentFlowName.value || t('flowDesigner.unnamedFlow'))
  initCanvas()
  document.addEventListener('click', closeAllMenusFn)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeAllMenusFn)
})
</script>

<style scoped>
.flow-editor-page {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--nf-bg-base);
  overflow: hidden;
}

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

.canvas-area {
  flex: 1;
  position: relative;
}

.vue-flow-canvas {
  width: 100%;
  height: 100%;
}

:deep(.vue-flow__background) {
  background: #eeeef1;
}
html.dark :deep(.vue-flow__background) {
  background: #09090b;
}

:deep(.vue-flow__edge-path) {
  stroke: #a1a1aa;
  stroke-width: 1.5;
}
html.dark :deep(.vue-flow__edge-path) {
  stroke: #52525b;
}

:deep(.vue-flow__edge.selected .vue-flow__edge-path) {
  stroke: var(--nf-accent);
  stroke-width: 2;
}

:deep(.vue-flow__controls) {
  background: var(--nf-bg-card);
  border: 1px solid var(--nf-border);
  border-radius: 8px;
  box-shadow: var(--nf-shadow);
}

:deep(.vue-flow__controls-button) {
  background: transparent;
  border: none;
  color: var(--nf-text-secondary);
}
:deep(.vue-flow__controls-button:hover) {
  background: var(--nf-bg-elevated);
  color: var(--nf-accent);
}

:deep(.vue-flow__minimap) {
  background: var(--nf-bg-card);
  border: 1px solid var(--nf-border);
  border-radius: 8px;
  box-shadow: var(--nf-shadow);
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
