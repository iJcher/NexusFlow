<!--
  节点/连线右键菜单组件
-->
<template>
  <div 
    v-show="visible" 
    class="nf-context-menu"
    :style="{ left: position.x + 'px', top: position.y + 'px' }"
    @click.stop
  >
    <div class="nf-context-menu-item hover:bg-nf-elevated cursor-pointer" @click="handleDelete">
      <el-icon class="mr-2.5 text-4"><Delete /></el-icon>
      <span>{{ t('flowComponents.delete') }}{{ targetType === 'node' ? t('flowComponents.node') : t('flowComponents.edge') }}</span>
    </div>
    <div class="nf-context-menu-item opacity-50 cursor-not-allowed" @click="handleCopy">
      <el-icon class="mr-2.5 text-4"><DocumentCopy /></el-icon>
      <span>{{ t('flowComponents.copy') }}</span>
      <span class="ml-auto text-3 text-nf-text-muted">({{ t('flowComponents.comingSoon') }})</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Delete, DocumentCopy } from '@element-plus/icons-vue';

const { t } = useI18n();

interface Props {
  visible: boolean;
  position: { x: number; y: number };
  targetType: 'node' | 'edge' | null;
  targetId: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  delete: [targetType: 'node' | 'edge', targetId: string];
  copy: [targetType: 'node' | 'edge', targetId: string];
}>();

const handleDelete = () => {
  if (props.targetType && props.targetId) {
    emit('delete', props.targetType, props.targetId);
  }
  emit('close');
};

const handleCopy = () => {
  if (props.targetType && props.targetId) {
    emit('copy', props.targetType, props.targetId);
  }
  emit('close');
};
</script>
