<!--
  流程设计器右键菜单组件
-->
<template>
  <!-- 右键菜单 -->
  <div 
    v-show="visible" 
    class="nf-context-menu"
    :style="{ left: position.x + 'px', top: position.y + 'px' }"
    @click.stop
  >
    <div class="nf-context-menu-item hover:bg-nf-elevated cursor-pointer" @click="handleAddNode">
      <el-icon class="mr-2.5 text-nf-accent" aria-hidden="true"><Plus /></el-icon>
      <span>{{ t('flowComponents.addNode') }}</span>
    </div>
    <div class="nf-context-menu-item opacity-50 cursor-not-allowed" @click="handleAddComment">
      <el-icon class="mr-2.5 text-nf-text-muted" aria-hidden="true"><ChatDotRound /></el-icon>
      <span>{{ t('flowComponents.addComment') }}</span>
      <span class="ml-auto text-3 text-nf-text-secondary">({{ t('flowComponents.comingSoon') }})</span>
    </div>
  </div>

  <!-- 节点选择器面板 -->
  <div 
    v-show="selectorVisible" 
    class="node-selector"
    :style="{ left: selectorPosition.x + 'px', top: selectorPosition.y + 'px' }"
    @click.stop
  >
    <div class="flex-between px-4 py-3 border-b border-nf-border text-sm font-600 text-nf-text-primary bg-nf-base">
      <span>{{ t('flowComponents.selectNode') }}</span>
      <el-icon @click="closeSelector" class="cursor-pointer"><Close /></el-icon>
    </div>
    <div class="grid grid-cols-2 gap-x-3 gap-y-2.5 p-3 overflow-y-auto max-h-112.5">
      <div 
        v-for="node in nodes" 
        :key="node.typeName"
        class="flex items-start p-3 cursor-pointer transition-all duration-200 border-l-3 border-l-transparent rounded-2.5 hover:bg-nf-elevated hover:border-l-nf-accent"
        @click="handleSelectNode(node.typeName)"
      >
        <el-icon class="node-item-icon" :size="20">
          <component :is="getNodeIcon(node.icon)" />
        </el-icon>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-500 text-nf-text-primary mb-0.5 truncate">{{ node.name }}</div>
          <div class="text-3 text-nf-text-secondary truncate">{{ node.description }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Close, Plus, ChatDotRound } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { NodeConfig } from '@/types/flow-designer/nodeConfig';
import * as ElementPlusIcons from '@element-plus/icons-vue';

const { t } = useI18n();

interface Props {
  visible: boolean;
  position: { x: number; y: number };
  nodes: NodeConfig[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  selectNode: [nodeType: string];
}>();

const selectorVisible = ref(false);
const selectorPosition = ref({ x: 0, y: 0 });

const getNodeIcon = (iconName: string) => {
  return (ElementPlusIcons as any)[iconName] || ElementPlusIcons.Document;
};


const handleAddNode = () => {
  selectorPosition.value = {
    x: props.position.x + 180,
    y: props.position.y
  };
  selectorVisible.value = true;
};

const closeSelector = () => {
  selectorVisible.value = false;
};

const handleSelectNode = (nodeType: string) => {
  emit('selectNode', nodeType);
  selectorVisible.value = false;
  emit('close');
};

const handleAddComment = () => {
  ElMessage.info(t('flowComponents.addCommentNotImplemented'));
  selectorVisible.value = false;
  emit('close');
};

const openSelectorAt = (pos: { x: number; y: number }) => {
  selectorPosition.value = pos;
  selectorVisible.value = true;
};

defineExpose({
  closeSelector,
  openSelectorAt
});
</script>

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
