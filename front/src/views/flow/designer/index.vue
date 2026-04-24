<template>
  <div class="flow-editor-page">
    <header class="editor-header">
      <div class="header-left">
        <button class="fui-back-btn" @click="closeWindow">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <span class="header-title">{{ flowTitle }}</span>
      </div>
      
      <div class="header-center">
        <span class="flow-name-badge">{{ currentFlowName || t('flowDesigner.unnamedFlow') }}</span>
      </div>

      <div class="header-right">
        <button
          v-if="flowId"
          class="fui-btn fui-btn--ghost"
          @click="openChatTest"
        >
          {{ t('flowDesigner.run') }}
        </button>
        <FlowExecutionLogDropdown
          v-if="flowId"
          :flow-id="flowId"
        />
        <button class="fui-btn fui-btn--primary" @click="persistence.saveFlow()">
          {{ t('flowDesigner.save') }}
        </button>
      </div>
    </header>

    <div class="canvas-area" ref="canvasRef" @contextmenu.prevent="handleCanvasContextMenu">
      <VueFlow
        id="nexusflow-canvas"
        :selection-key-code="isGroupSelecting ? true : 'Shift'"
        :pan-on-drag="!isGroupSelecting && canvasMode === 'move'"
        :nodes-draggable="!isGroupSelecting && canvasMode === 'move'"
        @node-context-menu="handleNodeContextMenu"
        @edge-context-menu="handleEdgeContextMenu"
        class="vue-flow-canvas"
      >
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
        <template #node-knowledge="nodeProps">
          <KnowledgeVFNode v-bind="nodeProps" />
        </template>
        <template #node-group="nodeProps">
          <GroupVFNode v-bind="nodeProps" />
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
import { ref, computed, provide, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { DocumentAdd, Close, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { VueFlow } from '@vue-flow/core'
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
import KnowledgeVFNode from './vf-nodes/KnowledgeVFNode.vue'
import GroupVFNode from './vf-nodes/GroupVFNode.vue'

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
  createGroupFromSelection,
  deleteGroup,
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
provide('deleteGroup', deleteGroup)

let groupMouseUpCleanup: (() => void) | null = null

watch(isGroupSelecting, (active) => {
  if (groupMouseUpCleanup) {
    groupMouseUpCleanup()
    groupMouseUpCleanup = null
  }

  if (active && canvasRef.value) {
    const container = canvasRef.value
    let dragged = false

    const onMouseDown = () => { dragged = false }
    const onMouseMove = () => { dragged = true }
    const onMouseUp = () => {
      if (!dragged) return
      setTimeout(() => {
        createGroupFromSelection()
      }, 60)
    }

    container.addEventListener('mousedown', onMouseDown, true)
    container.addEventListener('mousemove', onMouseMove, true)
    container.addEventListener('mouseup', onMouseUp, true)

    groupMouseUpCleanup = () => {
      container.removeEventListener('mousedown', onMouseDown, true)
      container.removeEventListener('mousemove', onMouseMove, true)
      container.removeEventListener('mouseup', onMouseUp, true)
    }
  }
})

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
  if (groupMouseUpCleanup) {
    groupMouseUpCleanup()
    groupMouseUpCleanup = null
  }
})
</script>

<style scoped>
.flow-editor-page {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #05070A;
  overflow: hidden;
  font-family: var(--nf-font-display);
}

.editor-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #141A22;
  background: rgba(8, 11, 16, 0.9);
  backdrop-filter: blur(12px);
  flex-shrink: 0;
  position: relative;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.fui-back-btn {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: 1px solid #1E2733;
  background: transparent;
  color: #5A6A7C;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.fui-back-btn:hover {
  color: var(--nf-accent);
  border-color: rgba(0, 255, 159, 0.3);
  box-shadow: var(--nf-glow-sm);
}

.header-title {
  font-family: var(--nf-font-display);
  font-size: 13px;
  font-weight: 600;
  color: #A0B0C0;
  letter-spacing: 0.03em;
}

.flow-name-badge {
  font-family: var(--nf-font-display);
  font-size: 12px;
  font-weight: 500;
  color: #5A6A7C;
  padding: 4px 14px;
  background: transparent;
  border-radius: 4px;
  border: 1px solid #1E2733;
}

/* ── Buttons ── */
.fui-btn {
  font-family: var(--nf-font-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 7px 18px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.fui-btn--primary {
  background: transparent;
  color: var(--nf-accent);
  border: 1px solid var(--nf-accent);
  box-shadow: var(--nf-glow-sm);
}
.fui-btn--primary:hover {
  background: rgba(0, 255, 159, 0.06);
  box-shadow: var(--nf-glow-md);
}

.fui-btn--ghost {
  background: transparent;
  color: #5A6A7C;
  border: 1px solid #1E2733;
}
.fui-btn--ghost:hover {
  border-color: rgba(0, 255, 159, 0.2);
  color: #A0B0C0;
}

.canvas-area {
  flex: 1;
  position: relative;
  background: #020406;
  isolation: isolate;
  overflow: hidden;
}

.canvas-area::before,
.canvas-area::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* 24px micro-dot grid, low luminance only */
.canvas-area::before {
  z-index: 0;
  background-color: #020406;
  background-image: radial-gradient(circle at center, #1e242c 0.7px, transparent 0.8px);
  background-size: 24px 24px;
}

/* ambient breathe halo, keep opacity under 0.03 */
.canvas-area::after {
  z-index: 0;
  background:
    radial-gradient(
      ellipse 60% 48% at 52% 46%,
      rgba(0, 255, 159, 0.026) 0%,
      rgba(0, 255, 159, 0.012) 32%,
      rgba(0, 255, 159, 0.003) 62%,
      transparent 100%
    );
}

.vue-flow-canvas {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 1;
  background: transparent;
}

:deep(.vue-flow__background) {
  background: transparent;
}

:deep(.vue-flow__edge-path) {
  stroke: #1E2733;
  stroke-width: 1.5;
}

:deep(.vue-flow__edge.selected .vue-flow__edge-path) {
  stroke: var(--nf-accent);
  stroke-width: 2;
  filter: drop-shadow(0 0 4px rgba(0, 255, 159, 0.35));
}

:deep(.vue-flow__selection) {
  background: rgba(0, 255, 159, 0.03);
  border: 1px solid rgba(0, 255, 159, 0.15);
  border-radius: 0;
}

:deep(.vue-flow__controls) {
  background: rgba(8, 11, 16, 0.9);
  border: 1px solid #1E2733;
  border-radius: 4px;
}

:deep(.vue-flow__controls-button) {
  background: transparent;
  border: none;
  color: #5A6A7C;
}
:deep(.vue-flow__controls-button:hover) {
  color: var(--nf-accent);
}

:deep(.vue-flow__minimap) {
  background: rgba(8, 11, 16, 0.9);
  border: 1px solid #141A22;
  border-radius: 4px;
}

:deep(.vue-flow__node-group) {
  z-index: 0 !important;
}
</style>

<style>
.input-dialog .el-dialog__header,
.session-dialog .el-dialog__header {
  background: #080B10;
  border-bottom: 1px solid #141A22;
  color: #E8EAF0;
}

.input-dialog .el-dialog__title,
.session-dialog .el-dialog__title {
  font-family: var(--nf-font-display);
  font-size: 15px;
  font-weight: 700;
  color: #E8EAF0;
}

.input-dialog.el-dialog,
.session-dialog.el-dialog {
  z-index: 2000 !important;
  background: #080B10;
  border: 1px solid #1E2733;
}

.el-overlay.is-message-box {
  z-index: 1999 !important;
}
</style>
