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

    <!-- Target handle: large circle indicator -->
    <Handle type="target" :position="Position.Left" :id="`${props.id}_left`" class="vf-handle-target" />

    <!-- Source handle: hover shows "+", click opens node selector -->
    <div class="source-handle-zone" @mouseenter="sourceHover = true" @mouseleave="onSourceLeave">
      <Handle type="source" :position="Position.Right" :id="`${props.id}_right`" class="vf-handle-source" />
      <button
        v-show="sourceHover || selectorOpen"
        class="handle-plus-btn"
        @click.stop="toggleSelector"
        @mousedown.stop
      >
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>

      <Transition name="selector-fade">
        <div v-if="selectorOpen" class="handle-node-selector" @click.stop @mousedown.stop>
          <div class="selector-header">
            <span>添加后继节点</span>
            <button class="selector-close" @click="selectorOpen = false">×</button>
          </div>
          <div class="selector-list">
            <button
              v-for="n in nodeList"
              :key="n.typeName"
              class="selector-item"
              @click="handleSelectNode(n.typeName)"
            >
              <span class="selector-item-name">{{ n.name }}</span>
              <span class="selector-item-desc">{{ n.description }}</span>
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { provide, inject, ref, watch, computed, type Component, type Ref } from 'vue'
import { Handle, Position, useNode } from '@vue-flow/core'
import type { NodeConfig } from '@/types/flow-designer/nodeConfig'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
  widget: Component
}>()

const { node } = useNode()

const canvasModeInjected = inject<Ref<'move' | 'select'>>('canvasMode', ref('move'))
const currentMode = computed(() => canvasModeInjected.value)

const nodeList = inject<Ref<NodeConfig[]>>('availableNodes', ref([]))
const addNodeAndConnect = inject<(sourceId: string, sourceHandle: string, nodeType: string) => void>('addNodeAndConnect', () => {})

const sourceHover = ref(false)
const selectorOpen = ref(false)

const onSourceLeave = () => {
  if (!selectorOpen.value) sourceHover.value = false
}

const toggleSelector = () => {
  selectorOpen.value = !selectorOpen.value
}

const handleSelectNode = (nodeType: string) => {
  addNodeAndConnect(props.id, `${props.id}_right`, nodeType)
  selectorOpen.value = false
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
.vf-node-shell {
  background: #ffffff;
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.05);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  min-width: 180px;
  position: relative;
}

.vf-node-shell:hover {
  border-color: var(--nf-accent);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0, 0, 0, 0.06);
}

.vf-node-shell.selected {
  border-color: var(--nf-accent);
  box-shadow: 0 0 0 2px var(--nf-accent-muted), 0 4px 16px rgba(0, 0, 0, 0.1);
}

html.dark .vf-node-shell {
  background: #18181b;
  border-color: #3f3f46;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3), 0 0 1px rgba(255, 255, 255, 0.04);
}
html.dark .vf-node-shell:hover {
  border-color: var(--nf-accent);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.06);
}
html.dark .vf-node-shell.selected {
  border-color: var(--nf-accent);
  box-shadow: 0 0 0 2px var(--nf-accent-muted), 0 4px 20px rgba(0, 0, 0, 0.35);
}

/* ── Target handle (left): larger circle ── */
.vf-handle-target {
  width: 12px;
  height: 12px;
  background: #ffffff;
  border: 2.5px solid #a1a1aa;
  border-radius: 50%;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}
.vf-handle-target:hover {
  border-color: var(--nf-accent);
  background: var(--nf-accent);
  transform: scale(1.3);
}
html.dark .vf-handle-target {
  background: #27272a;
  border-color: #52525b;
}
html.dark .vf-handle-target:hover {
  background: var(--nf-accent);
  border-color: var(--nf-accent);
}

/* ── Source handle zone (right): small dot + hover "+" button ── */
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
  width: 8px;
  height: 8px;
  background: #ffffff;
  border: 2px solid #a1a1aa;
  border-radius: 50%;
  position: relative;
  transition: border-color 0.15s, opacity 0.15s;
}
.source-handle-zone:hover .vf-handle-source {
  border-color: var(--nf-accent);
}
html.dark .vf-handle-source {
  background: #27272a;
  border-color: #52525b;
}

.handle-plus-btn {
  position: absolute;
  left: 14px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--nf-accent);
  background: #ffffff;
  color: var(--nf-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.15s;
  padding: 0;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
}
.handle-plus-btn:hover {
  background: var(--nf-accent);
  color: #ffffff;
  transform: scale(1.15);
}
html.dark .handle-plus-btn {
  background: #27272a;
}
html.dark .handle-plus-btn:hover {
  background: var(--nf-accent);
  color: #ffffff;
}

/* ── Node selector dropdown ── */
.handle-node-selector {
  position: absolute;
  left: 40px;
  top: 50%;
  transform: translateY(-50%);
  width: 200px;
  background: var(--nf-bg-card, #fff);
  border: 1px solid var(--nf-border, #e4e4e7);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  z-index: 100;
}

.selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--nf-text-primary, #18181b);
  border-bottom: 1px solid var(--nf-border, #e4e4e7);
}
.selector-close {
  border: none;
  background: none;
  font-size: 14px;
  cursor: pointer;
  color: var(--nf-text-muted, #a1a1aa);
  line-height: 1;
  padding: 0 2px;
}
.selector-close:hover {
  color: var(--nf-text-primary, #18181b);
}

.selector-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 4px;
}
.selector-list::-webkit-scrollbar { width: 3px; }
.selector-list::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 2px; }

.selector-item {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}
.selector-item:hover {
  background: var(--nf-bg-elevated, #f4f4f5);
}
.selector-item-name {
  font-size: 11px;
  font-weight: 500;
  color: var(--nf-text-primary, #18181b);
  line-height: 1.3;
}
.selector-item-desc {
  font-size: 9px;
  color: var(--nf-text-muted, #a1a1aa);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selector-fade-enter-active,
.selector-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.selector-fade-enter-from,
.selector-fade-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(-6px);
}

/* ── Element Plus overrides ── */
:deep(.el-select) {
  --el-select-input-font-size: 11px;
}
:deep(.el-input__inner) {
  font-size: 11px;
  height: 26px;
  line-height: 26px;
}
:deep(.el-input--small .el-input__wrapper) {
  padding: 0 7px;
}
:deep(.el-textarea__inner) {
  font-size: 11px;
  min-height: 40px !important;
}
:deep(.el-input-number--small) {
  width: 80px;
}
:deep(.el-select__wrapper) {
  min-height: 26px;
  font-size: 11px;
}
:deep(.el-select__placeholder) {
  font-size: 11px;
}
:deep(.el-slider__runway) {
  height: 4px;
}
:deep(.el-slider__button) {
  width: 12px;
  height: 12px;
}

/* ── Move mode: readonly, pointer cursor, no text selection ── */
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

/* ── Select mode: editable, normal cursors ── */
.node-select-mode {
  cursor: default;
}
.node-select-mode :deep(input),
.node-select-mode :deep(textarea) {
  cursor: text;
}
</style>
