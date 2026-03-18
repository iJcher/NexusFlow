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
    <div class="nf-context-menu-item hover:bg-nf-elevated" @click="handleAddNode">
      <span class="mr-2.5 text-4">➕</span>
      <span>{{ t('flowComponents.addNode') }}</span>
    </div>
    <div class="nf-context-menu-item opacity-50 cursor-not-allowed" @click="handleAddComment">
      <span class="mr-2.5 text-4">💬</span>
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
        <div class="node-item-icon flex-center w-8 h-8 rounded-2 text-4.5 mr-2.5 shrink-0 text-nf-text-primary" :class="getNodeIconClass(node.typeName)">
          <component :is="getNodeIcon(node.icon)" />
        </div>
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
import { Close } from '@element-plus/icons-vue';
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

const getNodeIconClass = (typeName: string) => {
  const classMap: Record<string, string> = {
    'StartNode': 'start-icon',
    'ReplyNode': 'reply-icon',
    'ConditionNode': 'condition-icon',
    'ForLoopNode': 'forloop-icon',
    'AssignVariableNode': 'assign-icon',
    'LLMNode': 'llm-icon',
    'JSCodeNode': 'jscode-icon',
    'HttpNode': 'http-icon',
  };
  return classMap[typeName] || 'default-icon';
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
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  width: 420px;
  max-height: 500px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.node-item-icon.start-icon { background: linear-gradient(135deg, #06b6d4 0%, #00d4aa 100%); }
.node-item-icon.reply-icon { background: linear-gradient(135deg, #00b4d8 0%, #0891b2 100%); }
.node-item-icon.condition-icon { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
.node-item-icon.forloop-icon { background: linear-gradient(135deg, #0ea5e9 0%, #00d4aa 100%); }
.node-item-icon.assign-icon { background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%); }
.node-item-icon.llm-icon { background: linear-gradient(135deg, #00b4d8 0%, #0891b2 100%); }
.node-item-icon.jscode-icon { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
.node-item-icon.http-icon { background: linear-gradient(135deg, #00b4d8 0%, #0891b2 100%); }
.node-item-icon.default-icon { background: linear-gradient(135deg, #0d2137 0%, #0a3d62 100%); }
</style>
