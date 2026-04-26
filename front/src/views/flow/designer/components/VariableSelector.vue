<template>
  <el-dialog
    v-model="visible"
    :title="t('flowComponents.selectVariable')"
    width="520px"
    append-to-body
    align-center
    :lock-scroll="false"
    :close-on-click-modal="false"
    class="variable-selector-dialog"
    modal-class="variable-selector-modal"
    @opened="handleOpened"
  >
    <!-- 搜索框 -->
    <div class="search-container">
      <el-input
        v-model="searchKeyword"
        :placeholder="t('flowComponents.searchVariable')"
        :prefix-icon="Search"
        clearable
        class="search-input"
      />
    </div>

    <!-- 变量列表 -->
    <div class="variable-list">
      <!-- 节点输出（两级结构） -->
      <div v-if="filteredNodeOutputGroups.length > 0" class="variable-group">
        <div class="group-title">{{ t('flowComponents.nodeOutput') }}</div>
        <!-- 节点分组 -->
        <div v-for="nodeGroup in filteredNodeOutputGroups" :key="nodeGroup.nodeId" class="node-output-group">
          <!-- 节点名称（不可选） -->
          <div class="node-group-title">
            <el-icon :size="12" class="node-icon-small"><Promotion /></el-icon>
            <span class="node-name-text">{{ nodeGroup.nodeName }}</span>
          </div>
          <!-- 节点输出属性（可选） -->
          <div
            v-for="output in nodeGroup.outputs"
            :key="output.key"
            class="variable-item variable-item-nested"
            @click="handleSelect({ ...output, type: getVariableTypeLabel(output.variableType) })"
          >
            <div class="variable-info">
              <el-icon class="variable-icon node-icon" :size="12"><Connection /></el-icon>
              <span class="variable-name">{{ output.outputName }}</span>
            </div>
            <span class="variable-type">{{ getVariableTypeLabel(output.variableType) }}</span>
          </div>
        </div>
      </div>

      <!-- 输入参数 -->
      <div v-if="filteredInputParameters.length > 0" class="variable-group">
        <div class="group-title">{{ t('flowComponents.inputParameters') }}</div>
        <div
          v-for="variable in filteredInputParameters"
          :key="variable.id || variable.name"
          class="variable-item"
          @click="handleSelect({ key: variable.name, label: variable.name, type: getVariableTypeLabel(variable.typeName), category: 'input' })"
        >
          <div class="variable-info">
            <el-icon class="variable-icon input-icon" :size="12"><Document /></el-icon>
            <span class="variable-name">{{ variable.name }}</span>
          </div>
          <span class="variable-type">{{ getVariableTypeLabel(variable.typeName) }}</span>
        </div>
      </div>

      <!-- 会话变量 -->
      <div v-if="filteredSessionVariables.length > 0" class="variable-group">
        <div class="group-title">{{ t('flowComponents.sessionVariables') }}</div>
        <div
          v-for="variable in filteredSessionVariables"
          :key="variable.id || variable.name"
          class="variable-item"
          @click="handleSelect({ key: variable.name, label: variable.name, type: getVariableTypeLabel(variable.typeName), category: 'session' })"
        >
          <div class="variable-info">
            <el-icon class="variable-icon session-icon" :size="12"><Collection /></el-icon>
            <span class="variable-name">{{ variable.name }}</span>
          </div>
          <span class="variable-type">{{ getVariableTypeLabel(variable.typeName) }}</span>
        </div>
      </div>

      <!-- 系统变量 -->
      <div v-if="filteredSystemVariables.length > 0" class="variable-group">
        <div class="group-title">{{ t('flowComponents.systemVariables') }}</div>
        <div
          v-for="variable in filteredSystemVariables"
          :key="variable.key"
          class="variable-item"
          @click="handleSelect(variable)"
        >
          <div class="variable-info">
            <el-icon class="variable-icon system-icon" :size="12"><Setting /></el-icon>
            <span class="variable-name">{{ variable.label }}</span>
          </div>
          <span class="variable-type">{{ variable.type }}</span>
        </div>
      </div>

      <!-- 空状态 -->
      <el-empty v-if="isEmpty" :description="t('flowComponents.noVariableFound')" :image-size="64" />
    </div>

  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search, Promotion, Connection, Document, Collection, Setting } from '@element-plus/icons-vue';
import { useFlowDesignerStore } from '@/stores/flowDesigner';
import type { AnyVariable, VariableItemType } from '@/types/flow-designer/Parameters/Variable';
import type { VariableItem } from '@/types/flow-designer/variableSelector.types';
import { buildNodeOutputGroups } from '@/utils/flowVariableSources';

const { t } = useI18n();

// Props
interface Props {
  visible: boolean;
  currentNodeId?: string;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  'update:visible': [value: boolean];
  'select': [variable: VariableItem];
}>();

// 状态管理
const flowStore = useFlowDesignerStore();

// 搜索关键词
const searchKeyword = ref('');

// 双向绑定 visible
const visible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
});

// 获取变量数据
const inputParameters = computed(() => flowStore.currentInputParameters || []);
const sessionVariables = computed(() => flowStore.currentSessionVariables || []);

// 系统变量（预定义）
const systemVariables = ref<VariableItem[]>([
  { key: 'sys.query', label: 'sys.query', type: 'String', category: 'system' },
  { key: 'sys.user', label: 'sys.user', type: 'String', category: 'system' },
  { key: 'sys.flowId', label: 'sys.flowId', type: 'String', category: 'system' },
  { key: 'sys.flowInstanceId', label: 'sys.flowInstanceId', type: 'String', category: 'system' },
  { key: 'sys.dialogueCount', label: 'sys.dialogueCount', type: 'Number', category: 'system' },
  { key: 'sys.conversationId', label: 'sys.conversationId', type: 'String', category: 'system' },
  { key: 'sys.files', label: 'sys.files', type: 'Array', category: 'system' }
]);

type NodeOutputGroup = ReturnType<typeof buildNodeOutputGroups>[number];

// 节点输出分组（按节点分组）
const nodeOutputGroups = computed<NodeOutputGroup[]>(() => {
  return buildNodeOutputGroups(
    props.currentNodeId,
    flowStore.currentNodes || [],
    flowStore.currentEdges || [],
  );
});

// 过滤函数
const filterByKeyword = (items: any[], keyword: string) => {
  if (!keyword) return items;
  const lowerKeyword = keyword.toLowerCase();
  return items.filter(item => {
    const name = item.name || item.label || item.key;
    return name.toLowerCase().includes(lowerKeyword);
  });
};

// 过滤后的节点输出分组
const filteredNodeOutputGroups = computed(() => {
  if (!searchKeyword.value) return nodeOutputGroups.value;
  
  const keyword = searchKeyword.value.toLowerCase();
  return nodeOutputGroups.value
    .map(group => {
      // 过滤输出属性
      const filteredOutputs = group.outputs.filter(output => 
        output.outputName.toLowerCase().includes(keyword) ||
        group.nodeName.toLowerCase().includes(keyword)
      );
      
      if (filteredOutputs.length > 0) {
        return {
          ...group,
          outputs: filteredOutputs
        };
      }
      return null;
    })
    .filter(group => group !== null) as NodeOutputGroup[];
});

const filteredInputParameters = computed(() => filterByKeyword(inputParameters.value, searchKeyword.value));
const filteredSessionVariables = computed(() => filterByKeyword(sessionVariables.value, searchKeyword.value));
const filteredSystemVariables = computed(() => filterByKeyword(systemVariables.value, searchKeyword.value));

// 判断是否为空
const isEmpty = computed(() => {
  return filteredNodeOutputGroups.value.length === 0 &&
         filteredInputParameters.value.length === 0 &&
         filteredSessionVariables.value.length === 0 &&
         filteredSystemVariables.value.length === 0;
});

// 获取变量类型标签
const getVariableTypeLabel = (typeName: VariableItemType): string => {
  const typeMap: Record<VariableItemType, string> = {
    'LongVariable': t('flowComponents.number'),
    'DecimalVariable': t('flowComponents.number'),
    'StringVariable': t('flowComponents.string'),
    'ObjectVariable': t('flowComponents.object'),
    'DateTimeVariable': t('flowComponents.dateTime'),
    'BooleanVariable': t('flowComponents.boolean'),
    'ArrayVariable': t('flowComponents.array')
  };
  return typeMap[typeName] || typeName;
};

// 处理选择
const handleSelect = (variable: VariableItem) => {
  emit('select', variable);
  handleClose();
};

// 关闭对话框
const handleClose = () => {
  visible.value = false;
  searchKeyword.value = '';
};

// 监听对话框打开，重置搜索
watch(visible, (newValue) => {
  if (newValue) {
    searchKeyword.value = '';
  }
});

const handleOpened = () => {
  searchKeyword.value = '';
};
</script>

<style scoped lang="scss">
.variable-selector-dialog {
  :deep(.el-dialog__header) {
    padding: 16px 20px;
    border-bottom: 1px solid var(--nf-border);
  }

  :deep(.el-dialog__body) {
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
}

.search-container {
  padding: 16px 20px;
  border-bottom: 1px solid var(--nf-border);
}

.variable-list {
  max-height: 500px;
  overflow-y: auto;
  padding: 12px 0;

  .variable-group {
    margin-bottom: 16px;

    &:last-child { margin-bottom: 0; }

    .group-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--nf-text-muted);
      text-transform: uppercase;
      padding: 8px 20px;
      letter-spacing: 0.5px;
    }

    .node-output-group {
      margin-bottom: 12px;
      &:last-child { margin-bottom: 0; }

      .node-group-title {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 20px;
        background: var(--nf-accent-muted);
        border-left: 3px solid var(--nf-accent);

        .node-icon-small {
          color: var(--nf-accent);
        }

        .node-name-text {
          font-size: 13px;
          font-weight: 600;
          color: var(--nf-text-primary);
        }
      }
    }

    .variable-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 20px;
      cursor: pointer;
      transition: background-color 0.15s ease;

      &:hover { background: var(--nf-accent-muted); }

      &.variable-item-nested {
        padding-left: 48px;
        background: var(--nf-bg-elevated);
        &:hover { background: var(--nf-accent-muted); }
      }

      .variable-info {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1;
        min-width: 0;
      }

      .variable-icon {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;

        &.node-icon {
          color: var(--nf-accent);
          background: var(--nf-accent-muted);
          border: 1px solid var(--nf-border);
        }

        &.input-icon {
          color: var(--nf-accent2);
          background: rgba(8, 145, 178, 0.12);
          border: 1px solid var(--nf-border);
        }

        &.session-icon {
          color: var(--nf-accent2);
          background: rgba(8, 145, 178, 0.12);
          border: 1px solid var(--nf-border);
        }

        &.system-icon {
          color: var(--nf-danger);
          background: var(--nf-danger-muted);
          border: 1px solid var(--nf-border);
        }
      }

      .variable-name {
        flex: 1;
        font-size: 13px;
        font-weight: 500;
        color: var(--nf-text-primary);
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .variable-type {
        flex-shrink: 0;
        font-size: 12px;
        color: var(--nf-text-muted);
        font-weight: 400;
        margin-left: 12px;
      }
    }
  }

}

.variable-list::-webkit-scrollbar { width: 4px; }
.variable-list::-webkit-scrollbar-track { background: transparent; }
.variable-list::-webkit-scrollbar-thumb {
  background: var(--nf-scrollbar);
  border-radius: 2px;
  &:hover { background: var(--nf-scrollbar-hover); }
}
</style>

<style lang="scss">
.variable-selector-modal {
  z-index: 3000;
}

.variable-selector-dialog.el-dialog {
  background: var(--nf-bg-elevated, #0E121A);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);

  .el-dialog__header {
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .el-dialog__title {
    color: var(--nf-text-primary, #E6EDF3);
    font-family: var(--nf-font-display);
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.06em;
  }

  .el-dialog__body {
    padding: 0;
    min-height: 260px;
    overflow: hidden;
  }
}
</style>
