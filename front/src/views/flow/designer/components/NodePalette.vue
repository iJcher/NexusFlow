<template>
  <div class="node-palette">
    <button
      class="palette-icon-btn mode-btn-single"
      :title="canvasMode === 'move' ? '移动模式 — 点击切换到编辑模式 (V)' : '编辑模式 — 点击切换到移动模式 (H)'"
      @click="emit('modeChange', canvasMode === 'move' ? 'select' : 'move')"
    >
      <el-icon :size="18">
        <Rank v-if="canvasMode === 'move'" />
        <Pointer v-else />
      </el-icon>
    </button>

    <div class="palette-divider" />

    <button
      v-for="group in groupedNodes"
      :key="group.category"
      class="palette-icon-btn"
      :class="{ active: activeCategory === group.category }"
      :title="group.label"
      @click="toggleCategory(group.category)"
    >
      <el-icon :size="18">
        <component :is="group.icon" />
      </el-icon>
    </button>

    <div class="palette-divider" />

    <button
      class="palette-icon-btn"
      :class="{ active: props.isGroupSelecting }"
      :title="props.isGroupSelecting ? '取消框选分组 (Esc)' : '框选分组 — 点击后拖动框选节点'"
      @click="emit('group')"
    >
      <el-icon :size="18"><Folder /></el-icon>
    </button>

    <Transition name="popover-fade">
      <div
        v-if="activeCategory"
        class="palette-popover"
        @click.stop
      >
        <div class="popover-header">
          <span>{{ activeCategoryLabel }}</span>
          <el-icon class="close-icon" @click="activeCategory = null"><Close /></el-icon>
        </div>
        <div class="popover-nodes">
          <button
            v-for="node in activeCategoryNodes"
            :key="node.typeName"
            class="node-item"
            @click="handleAdd(node.typeName)"
          >
            <el-icon :size="16" class="node-item-icon">
              <component :is="getIcon(node.icon)" />
            </el-icon>
            <div class="node-item-info">
              <div class="node-item-name">{{ node.name }}</div>
              <div class="node-item-desc">{{ node.description }}</div>
            </div>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Close, Folder, Pointer, Rank } from '@element-plus/icons-vue'
import * as Icons from '@element-plus/icons-vue'
import type { NodeConfig } from '@/types/flow-designer/nodeConfig'
import { NodeCategory } from '@/types/flow-designer/nodeConfig'

const props = defineProps<{
  nodes: NodeConfig[]
  canvasMode: 'move' | 'select'
  isGroupSelecting?: boolean
}>()

const emit = defineEmits<{
  addNode: [nodeType: string]
  group: []
  modeChange: [mode: 'move' | 'select']
}>()

const activeCategory = ref<string | null>(null)

interface NodeGroup {
  category: string
  label: string
  icon: any
  nodes: NodeConfig[]
}

const categoryMeta: Record<string, { label: string; icon: any }> = {
  [NodeCategory.BASIC]: { label: '基础节点', icon: Icons.Grid },
  [NodeCategory.LOGIC]: { label: '逻辑节点', icon: Icons.Share },
  [NodeCategory.AI]: { label: 'AI 节点', icon: Icons.MagicStick },
  [NodeCategory.APPROVAL]: { label: '审批节点', icon: Icons.CircleCheck },
}

const groupedNodes = computed<NodeGroup[]>(() => {
  const map = new Map<string, NodeConfig[]>()
  for (const n of props.nodes) {
    if (!map.has(n.category)) map.set(n.category, [])
    map.get(n.category)!.push(n)
  }
  return Array.from(map.entries()).map(([cat, nodes]) => ({
    category: cat,
    label: categoryMeta[cat]?.label || cat,
    icon: categoryMeta[cat]?.icon || Icons.Grid,
    nodes,
  }))
})

const activeCategoryLabel = computed(() => {
  const g = groupedNodes.value.find(g => g.category === activeCategory.value)
  return g?.label || ''
})

const activeCategoryNodes = computed(() => {
  const g = groupedNodes.value.find(g => g.category === activeCategory.value)
  return g?.nodes || []
})

const getIcon = (name: string) => (Icons as any)[name] || Icons.Document

const toggleCategory = (cat: string) => {
  activeCategory.value = activeCategory.value === cat ? null : cat
}

const handleAdd = (nodeType: string) => {
  emit('addNode', nodeType)
  activeCategory.value = null
}
</script>

<style scoped>
.node-palette {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  background: rgba(8, 11, 16, 0.9);
  border: 1px solid #1E2733;
  border-radius: 6px;
  backdrop-filter: blur(12px);
}

.mode-btn-single {
  color: var(--nf-accent);
  border-color: rgba(0, 255, 159, 0.15);
}

.palette-icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #5A6A7C;
  cursor: pointer;
  transition: all 0.2s;
}

.palette-divider {
  width: 20px;
  height: 1px;
  background: #141A22;
  align-self: center;
  margin: 4px 0;
}

.palette-icon-btn:hover {
  color: #A0B0C0;
  border-color: #1E2733;
}
.palette-icon-btn.active {
  color: var(--nf-accent);
  border-color: rgba(0, 255, 159, 0.3);
  box-shadow: var(--nf-glow-sm);
}

.palette-popover {
  position: absolute;
  top: 50%;
  left: calc(100% + 8px);
  transform: translateY(-50%);
  width: 230px;
  background: rgba(8, 11, 16, 0.95);
  border: 1px solid #1E2733;
  border-radius: 6px;
  overflow: hidden;
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}

.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  font-family: var(--nf-font-display);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #5A6A7C;
  border-bottom: 1px solid #141A22;
}

.close-icon {
  cursor: pointer;
  color: #5A6A7C;
  transition: color 0.15s;
}
.close-icon:hover {
  color: var(--nf-accent);
}

.popover-nodes {
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 360px;
  overflow-y: auto;
}

.node-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: all 0.15s;
  border-left: 2px solid transparent;
}

.node-item:hover {
  background: rgba(255, 255, 255, 0.03);
  border-left-color: var(--nf-accent);
}

.node-item-icon {
  flex-shrink: 0;
  color: #5A6A7C;
}

.node-item:hover .node-item-icon {
  color: var(--nf-accent);
}

.node-item-info {
  flex: 1;
  min-width: 0;
}

.node-item-name {
  font-family: var(--nf-font-display);
  font-size: 13px;
  font-weight: 500;
  color: #A0B0C0;
  line-height: 1.3;
}

.node-item:hover .node-item-name {
  color: #e4e4e7;
}

.node-item-desc {
  font-family: var(--nf-font-display);
  font-size: 11px;
  color: #3A4A5C;
  line-height: 1.3;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
}
</style>
