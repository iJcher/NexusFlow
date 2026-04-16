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
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mode-btn-single {
  color: var(--nf-accent);
  border-color: var(--nf-accent);
}

.palette-icon-btn {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--nf-border);
  border-radius: 10px;
  background: var(--nf-bg-card);
  color: var(--nf-text-secondary);
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.palette-divider {
  width: 24px;
  height: 1px;
  background: var(--nf-border);
  align-self: center;
}

.palette-icon-btn:hover,
.palette-icon-btn.active {
  border-color: var(--nf-accent);
  color: var(--nf-accent);
  background: var(--nf-bg-elevated);
}

.palette-popover {
  position: absolute;
  top: 50%;
  left: 50px;
  transform: translateY(-50%);
  width: 220px;
  background: var(--nf-bg-card);
  border: 1px solid var(--nf-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--nf-text-primary);
  border-bottom: 1px solid var(--nf-border);
}

.close-icon {
  cursor: pointer;
  color: var(--nf-text-muted);
  transition: color 0.15s;
}
.close-icon:hover {
  color: var(--nf-text-primary);
}

.popover-nodes {
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 360px;
  overflow-y: auto;
}

.node-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.15s;
}

.node-item:hover {
  background: var(--nf-bg-elevated);
}

.node-item-icon {
  flex-shrink: 0;
  color: var(--nf-text-secondary);
}

.node-item-info {
  flex: 1;
  min-width: 0;
}

.node-item-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--nf-text-primary);
  line-height: 1.3;
}

.node-item-desc {
  font-size: 10px;
  color: var(--nf-text-muted);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(-8px);
}
</style>
