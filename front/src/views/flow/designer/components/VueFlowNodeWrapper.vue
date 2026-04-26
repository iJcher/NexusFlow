<template>
  <div
    class="vf-node-shell"
    :class="{
      selected: props.selected,
      'node-move-mode': currentMode === 'move',
      'node-select-mode': currentMode === 'select',
    }"
  >
    <component :is="widgetComponent" />

    <div class="target-handle-zone" @mouseenter="targetHover = true" @mouseleave="onTargetLeave">
      <Handle type="target" :position="Position.Left" :id="`${props.id}_left`" class="vf-handle-target" />
      <button
        v-show="showTargetPlus"
        class="handle-plus-btn handle-plus-btn--left"
        :aria-label="t('flowDesigner.addPrevNode')"
        @click.stop="openSelector('prev')"
        @mousedown.stop
      >
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
    </div>

    <div v-if="!usesCustomSourceHandles" class="source-handle-zone" @mouseenter="sourceHover = true" @mouseleave="onSourceLeave">
      <Handle type="source" :position="Position.Right" :id="`${props.id}_right`" class="vf-handle-source" />
      <button
        v-show="showSourcePlus"
        class="handle-plus-btn handle-plus-btn--right"
        :aria-label="t('flowDesigner.addNextNode')"
        @click.stop="openSelector('next')"
        @mousedown.stop
      >
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
    </div>

    <Transition name="selector-fade">
      <div
        v-if="selectorOpen"
        class="handle-node-selector"
        :class="selectorDirection === 'prev' ? 'handle-node-selector--left' : 'handle-node-selector--right'"
        @click.stop
        @mousedown.stop
      >
        <div class="selector-header">
          <span>{{ selectorTitle }}</span>
          <button class="selector-close" @click="selectorOpen = false">×</button>
        </div>
        <div class="selector-list">
          <button
            v-for="n in filteredNodeList"
            :key="n.typeName"
            class="selector-item"
            @click="handleSelectNode(n.typeName)"
          >
            <span class="selector-item-name">{{ n.name }}</span>
            <span class="selector-item-desc">{{ n.description }}</span>
          </button>
          <div v-if="filteredNodeList.length === 0" class="selector-empty">
            {{ t('flowDesigner.noAvailableNode') }}
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { provide, inject, ref, watch, computed, type Component, type Ref } from 'vue'
import { Handle, Position, useNode } from '@vue-flow/core'
import { useI18n } from 'vue-i18n'
import type { NodeConfig } from '@/types/flow-designer/nodeConfig'
import { getAvailableNextNodeTypes, getAvailablePrevNodeTypes } from '@/utils/flowNodeRules'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
  widget: Component
}>()

const { node } = useNode()
const { t } = useI18n()

const canvasModeInjected = inject<Ref<'move' | 'select'>>('canvasMode', ref('move'))
const currentMode = computed(() => canvasModeInjected.value)

const nodeList = inject<Ref<NodeConfig[]>>('availableNodes', ref([]))
const addNodeAndConnect = inject<(sourceId: string, sourceHandle: string, nodeType: string) => void>('addNodeAndConnect', () => {})
const addNodeBeforeAndConnect = inject<(targetId: string, targetHandle: string, nodeType: string) => void>('addNodeBeforeAndConnect', () => {})

const targetHover = ref(false)
const sourceHover = ref(false)
const selectorOpen = ref(false)
const selectorDirection = ref<'prev' | 'next'>('next')

const currentNodeType = computed<string>(() => String(props.data?.typeName || node.data?.typeName || node.type || ''))
const usesCustomSourceHandles = computed<boolean>(() => currentNodeType.value === 'ConditionNode')
const availablePrevTypes = computed<string[]>(() => getAvailablePrevNodeTypes(currentNodeType.value))
const availableNextTypes = computed<string[]>(() => getAvailableNextNodeTypes(currentNodeType.value))
const filteredNodeList = computed<NodeConfig[]>(() => {
  const allowedTypes = selectorDirection.value === 'prev' ? availablePrevTypes.value : availableNextTypes.value
  return nodeList.value.filter(n => allowedTypes.includes(n.typeName))
})
const selectorTitle = computed<string>(() =>
  selectorDirection.value === 'prev' ? t('flowDesigner.addPrevNode') : t('flowDesigner.addNextNode'),
)
const showTargetPlus = computed<boolean>(() => (
  props.selected || targetHover.value || (selectorDirection.value === 'prev' && selectorOpen.value)
) && availablePrevTypes.value.length > 0)
const showSourcePlus = computed<boolean>(() => (
  props.selected || sourceHover.value || (selectorDirection.value === 'next' && selectorOpen.value)
) && availableNextTypes.value.length > 0)

const onTargetLeave = () => {
  if (!selectorOpen.value || selectorDirection.value !== 'prev') targetHover.value = false
}

const onSourceLeave = () => {
  if (!selectorOpen.value || selectorDirection.value !== 'next') sourceHover.value = false
}

const openSelector = (direction: 'prev' | 'next') => {
  if (selectorOpen.value && selectorDirection.value === direction) {
    selectorOpen.value = false
    return
  }

  selectorDirection.value = direction
  selectorOpen.value = true
}

const handleSelectNode = (nodeType: string) => {
  if (selectorDirection.value === 'prev') {
    addNodeBeforeAndConnect(props.id, `${props.id}_left`, nodeType)
  }
  else {
    addNodeAndConnect(props.id, `${props.id}_right`, nodeType)
  }
  selectorOpen.value = false
  targetHover.value = false
  sourceHover.value = false
}

const nodeDataRef = ref<Record<string, any>>({ ...props.data })

watch(() => props.data, (newData) => {
  nodeDataRef.value = { ...newData }
}, { deep: true })

provide('nodeData', nodeDataRef)
provide('nodeId', props.id)
provide('onUpdate', (patch: Record<string, any>) => {
  node.data = { ...node.data, ...patch }
  nodeDataRef.value = { ...node.data }
})
provide('onResize', (width: number, height: number) => {
  node.style = { ...node.style, width: `${width}px`, height: `${height}px` }
})

const widgetComponent = props.widget
</script>

<style scoped>
/* ── Node shell ── */
.vf-node-shell {
  background: rgba(8, 11, 16, 0.92);
  border: 1px solid #1A2030;
  border-radius: 6px;
  transition: all 0.25s ease;
  min-width: 180px;
  position: relative;
  font-family: var(--nf-font-display);
  backdrop-filter: blur(8px);
}

.vf-node-shell:hover {
  border-color: rgba(0, 255, 159, 0.35);
  box-shadow: 0 0 12px rgba(0, 255, 159, 0.1);
}

.vf-node-shell.selected {
  border-color: var(--nf-accent);
  box-shadow: 0 0 16px rgba(0, 255, 159, 0.15), 0 0 32px rgba(0, 255, 159, 0.05);
}

/* ── Target handle zone (left) ── */
.target-handle-zone {
  position: absolute;
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  z-index: 5;
}

.vf-handle-target {
  width: 8px;
  height: 8px;
  background: #05070A;
  border: 1.5px solid #2A3544;
  border-radius: 50%;
  transition: all 0.2s;
}
.target-handle-zone:hover .vf-handle-target {
  border-color: var(--nf-accent);
  box-shadow: var(--nf-glow-sm);
}

/* ── Source handle zone (right) ── */
.source-handle-zone {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  z-index: 5;
}

.vf-handle-source {
  width: 6px;
  height: 6px;
  background: #05070A;
  border: 1.5px solid #2A3544;
  border-radius: 50%;
  position: relative;
  transition: all 0.2s;
}
.source-handle-zone:hover .vf-handle-source {
  border-color: var(--nf-accent);
  box-shadow: var(--nf-glow-sm);
}

.handle-plus-btn {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid rgba(0, 255, 159, 0.35);
  background: rgba(8, 11, 16, 0.9);
  color: var(--nf-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;
  box-shadow: var(--nf-glow-sm);
}

.handle-plus-btn--left {
  right: 14px;
}

.handle-plus-btn--right {
  left: 14px;
}

.handle-plus-btn:hover {
  border-color: var(--nf-accent-hover);
  color: var(--nf-accent-hover);
  background: rgba(0, 255, 159, 0.06);
  box-shadow: var(--nf-glow-md);
}

/* ── Node selector dropdown ── */
.handle-node-selector {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 210px;
  background: rgba(8, 11, 16, 0.95);
  border: 1px solid #1E2733;
  border-radius: 6px;
  overflow: hidden;
  z-index: 100;
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}

.handle-node-selector--left {
  right: calc(100% + 34px);
}

.handle-node-selector--right {
  left: calc(100% + 34px);
}

.selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  font-family: var(--nf-font-display);
  font-size: 12px;
  font-weight: 600;
  color: var(--nf-text-body);
  border-bottom: 1px solid #141A22;
}
.selector-close {
  border: none;
  background: none;
  font-size: 14px;
  cursor: pointer;
  color: #5A6A7C;
  line-height: 1;
  padding: 0 2px;
}
.selector-close:hover {
  color: var(--nf-accent);
}

.selector-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 4px;
}
.selector-list::-webkit-scrollbar { width: 3px; }
.selector-list::-webkit-scrollbar-thumb { background: #1E2733; border-radius: 2px; }

.selector-item {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
  border-left: 2px solid transparent;
}
.selector-item:hover {
  background: rgba(255, 255, 255, 0.03);
  border-left-color: var(--nf-accent);
}
.selector-item-name {
  font-family: var(--nf-font-display);
  font-size: 12px;
  font-weight: 500;
  color: #A0B0C0;
  line-height: 1.3;
}
.selector-item:hover .selector-item-name {
  color: #E6EDF3;
}
.selector-item-desc {
  font-family: var(--nf-font-display);
  font-size: 12px;
  color: var(--nf-text-tertiary);
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selector-empty {
  padding: 10px 8px;
  color: var(--nf-text-secondary);
  font-family: var(--nf-font-display);
  font-size: 12px;
  line-height: 1.5;
}

.selector-fade-enter-active,
.selector-fade-leave-active {
  transition: opacity 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.selector-fade-enter-from,
.selector-fade-leave-to {
  opacity: 0;
}

/* ── Element Plus overrides (FUI within nodes) ── */
:deep(.el-select) {
  --el-select-input-font-size: 11px;
}
:deep(.el-input__inner) {
  font-size: 12px;
  height: 26px;
  line-height: 26px;
  font-family: var(--nf-font-display);
  color: #A0B0C0;
}
:deep(.el-input--small .el-input__wrapper) {
  padding: 0 7px;
  background: transparent;
  border: 1px solid #1E2733;
  border-radius: 4px;
  box-shadow: none !important;
}
:deep(.el-input--small .el-input__wrapper:focus-within) {
  border-color: var(--nf-accent);
  box-shadow: var(--nf-glow-sm) !important;
}
:deep(.el-textarea__inner) {
  font-size: 12px;
  min-height: 40px !important;
  font-family: var(--nf-font-display);
  background: transparent;
  border: 1px solid #1E2733;
  color: #A0B0C0;
}
:deep(.el-textarea__inner:focus) {
  border-color: var(--nf-accent);
}
:deep(.el-input-number--small) {
  width: 80px;
}
:deep(.el-select__wrapper) {
  min-height: 26px;
  font-size: 11px;
  background: transparent;
}
:deep(.el-select__placeholder) {
  font-size: 11px;
}
:deep(.el-slider__runway) {
  height: 3px;
  background: #1E2733;
}
:deep(.el-slider__bar) {
  background: var(--nf-accent);
}
:deep(.el-slider__button) {
  width: 10px;
  height: 10px;
  border-color: var(--nf-accent);
  background: #05070A;
}

/* ── Move mode ── */
.node-move-mode {
  user-select: none;
  cursor: grab;
}
.node-move-mode * {
  cursor: pointer !important;
  user-select: none !important;
}
.node-move-mode :deep(input),
.node-move-mode :deep(textarea),
.node-move-mode :deep(select),
.node-move-mode :deep(.el-input__wrapper),
.node-move-mode :deep(.el-textarea__inner),
.node-move-mode :deep(.el-select),
.node-move-mode :deep(.el-select__wrapper),
.node-move-mode :deep(.el-slider),
.node-move-mode :deep(.el-switch),
.node-move-mode :deep(.el-input-number) {
  pointer-events: none !important;
}

/* ── Select mode ── */
.node-select-mode {
  cursor: default;
}
.node-select-mode :deep(input),
.node-select-mode :deep(textarea) {
  cursor: text;
}
</style>
