<!--
  流程设计器右键菜单组件
-->
<script setup lang="ts">
import type { NodeConfig } from '@/types/flow-designer/nodeConfig'
import { ChatDotRound, Close, Plus } from '@element-plus/icons-vue'
import * as ElementPlusIcons from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  selectNode: [nodeType: string]
}>()

const { t } = useI18n()

interface Props {
  visible: boolean
  position: { x: number, y: number }
  nodes: NodeConfig[]
}

const selectorVisible = ref(false)
const selectorPosition = ref({ x: 0, y: 0 })

function getNodeIcon(iconName: string) {
  return (ElementPlusIcons as any)[iconName] || ElementPlusIcons.Document
}

function handleAddNode() {
  selectorPosition.value = {
    x: props.position.x + 180,
    y: props.position.y,
  }
  selectorVisible.value = true
}

function closeSelector() {
  selectorVisible.value = false
}

function handleSelectNode(nodeType: string) {
  emit('selectNode', nodeType)
  selectorVisible.value = false
  emit('close')
}

function handleAddComment() {
  ElMessage.info(t('flowComponents.addCommentNotImplemented'))
  selectorVisible.value = false
  emit('close')
}

function openSelectorAt(pos: { x: number, y: number }) {
  selectorPosition.value = pos
  selectorVisible.value = true
}

defineExpose({
  closeSelector,
  openSelectorAt,
})
</script>

<template>
  <!-- 右键菜单 -->
  <div
    v-show="visible"
    class="nf-context-menu"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @click.stop
  >
    <div class="nf-context-menu-item cursor-pointer hover:bg-nf-elevated" @click="handleAddNode">
      <el-icon class="mr-2.5 text-nf-accent" aria-hidden="true">
        <Plus />
      </el-icon>
      <span>{{ t('flowComponents.addNode') }}</span>
    </div>
    <div class="nf-context-menu-item cursor-not-allowed opacity-50" @click="handleAddComment">
      <el-icon class="mr-2.5 text-nf-text-muted" aria-hidden="true">
        <ChatDotRound />
      </el-icon>
      <span>{{ t('flowComponents.addComment') }}</span>
      <span class="ml-auto text-3 text-nf-text-secondary">({{ t('flowComponents.comingSoon') }})</span>
    </div>
  </div>

  <!-- 节点选择器面板 -->
  <div
    v-show="selectorVisible"
    class="node-selector"
    :style="{ left: `${selectorPosition.x}px`, top: `${selectorPosition.y}px` }"
    @click.stop
  >
    <div class="flex-between border-b border-nf-border bg-nf-base px-4 py-3 text-sm text-nf-text-primary font-600">
      <span>{{ t('flowComponents.selectNode') }}</span>
      <el-icon class="cursor-pointer" @click="closeSelector">
        <Close />
      </el-icon>
    </div>
    <div class="grid grid-cols-2 max-h-112.5 gap-x-3 gap-y-2.5 overflow-y-auto p-3">
      <div
        v-for="node in nodes"
        :key="node.typeName"
        class="flex cursor-pointer items-start border-l-3 border-l-transparent rounded-2.5 p-3 transition-all duration-200 hover:border-l-nf-accent hover:bg-nf-elevated"
        @click="handleSelectNode(node.typeName)"
      >
        <el-icon class="node-item-icon" :size="20">
          <component :is="getNodeIcon(node.icon)" />
        </el-icon>
        <div class="min-w-0 flex-1">
          <div class="mb-0.5 truncate text-sm text-nf-text-primary font-500">
            {{ node.name }}
          </div>
          <div class="truncate text-3 text-nf-text-secondary">
            {{ node.description }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-selector {
  position: fixed;
  z-index: 1001;
  background: var(--nf-bg-elevated);
  border: 1px solid var(--nf-border);
  border-radius: 12px;
  box-shadow: var(--nf-shadow-lg);
  width: 420px;
  max-height: 500px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.node-item-icon {
  color: var(--nf-text-secondary);
  flex-shrink: 0;
  margin-right: 10px;
}
</style>
