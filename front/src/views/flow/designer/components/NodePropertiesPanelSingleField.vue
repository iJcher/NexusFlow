<template>
  <div class="property-field">
    <label class="field-label">{{ label }}</label>
    
    <div class="field-content">
      <!-- 文本输入框 -->
      <el-input
        v-if="type === 'text'"
        v-model="localValue"
        :placeholder="placeholder"
        :readonly="readonly"
        @input="handleChange"
        clearable
      />
      
      <!-- 多行文本输入框 -->
      <el-input
        v-else-if="type === 'textarea'"
        v-model="localValue"
        type="textarea"
        :placeholder="placeholder"
        :readonly="readonly"
        :rows="2"
        @input="handleChange"
        resize="vertical"
      />
      
      <!-- 数字输入框 -->
      <el-input-number
        v-else-if="type === 'number'"
        v-model="localValue"
        :placeholder="placeholder"
        @change="handleChange"
        style="width: 100%"
      />
      
      <!-- 开关 -->
      <el-switch
        v-else-if="type === 'boolean'"
        v-model="localValue"
        @change="handleChange"
      />
      
      <!-- 普通选择器 -->
      <el-select
        v-else-if="type === 'select'"
        v-model="localValue"
        :placeholder="placeholder"
        @change="handleChange"
        style="width: 100%"
      >
        <el-option
          v-for="option in options"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
      
      <!-- HTTP Method + 导入 cURL -->
      <div v-else-if="type === 'httpMethod'" class="http-method-row">
        <el-select
          v-model="localValue"
          placeholder="HTTP Method"
          @change="handleChange"
          class="http-method-select"
          size="small"
        >
          <el-option
            v-for="option in options"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-button
          type="primary"
          size="small"
          class="http-curl-btn"
          @click="openCurlDialog"
        >
          导入 cURL
        </el-button>
        
        <el-dialog
          v-model="curlDialogVisible"
          title="导入 cURL"
          width="600px"
        >
          <el-input
            v-model="curlText"
            type="textarea"
            :rows="6"
            :placeholder="curlPlaceholder"
          />
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="curlDialogVisible = false">取消</el-button>
              <el-button type="primary" @click="handleCurlConfirm">确定</el-button>
            </span>
          </template>
        </el-dialog>
      </div>
      
      <!-- 条件列表编辑器 -->
      <div
        v-else-if="type === 'conditions'"
        class="conditions-editor"
      >
        <div class="conditions-list">
          <div 
            v-for="(condition, index) in conditionsList"
            :key="condition.id"
            class="condition-item"
          >
            <div class="condition-header">
              <span class="condition-index">{{ index + 1 }}</span>
              <el-input
                v-model="condition.description"
                :placeholder="t('flowComponents.conditionDescription')"
                size="small"
                class="condition-description"
                @input="updateCondition"
              />
              <el-button
                type="danger"
                size="small"
                text
                :icon="Delete"
                @click="removeCondition(index)"
                :title="t('flowComponents.deleteCondition')"
              />
            </div>
            
            <JSExpressionUnit
              v-model="(condition.expressionUnit as JSExpressionUnitType)"
              :placeholder="t('flowComponents.conditionExpression', { index: index + 1 })"
              :rows="6"
              @change="updateCondition"
            />
          </div>
        </div>
        
        <el-button
          type="primary"
          size="small"
          :icon="Plus"
          @click="addCondition"
          class="add-condition-btn"
        >
          {{ t('flowComponents.addCondition') }}
        </el-button>
      </div>

      <!-- 文本输入框（支持变量和放大） -->
      <TextInputUnit
        v-else-if="type === 'textInput'"
        v-model="localValue"
        :placeholder="placeholder"
        :title="label"
        :rows="2"
        @change="handleChange"
      />
      
      <!-- 模型选择器 -->
      <el-select
        v-else-if="type === 'modelSelector'"
        v-model="localValue"
        :placeholder="placeholder || t('flowComponents.selectModel')"
        @change="handleChange"
        style="width: 100%"
        filterable
      >
        <el-option-group
          v-for="provider in modelProviders"
          :key="provider.id"
          :label="provider.platformName || t('flowComponents.unknownPlatform')"
        >
          <el-option
            v-for="modelName in provider.llmNames"
            :key="`${provider.platformName}|${modelName}`"
            :label="modelName"
            :value="`${provider.platformName}|${modelName}`"
          >
            <span style="float: left">{{ modelName }}</span>
            <span style="float: right; color: var(--nf-text-muted); font-size: 12px">{{ provider.platformName }}</span>
          </el-option>
        </el-option-group>
      </el-select>
      
      <!-- 滑块（用于温度等参数） -->
      <div v-else-if="type === 'slider'" class="slider-container">
        <el-slider
          v-model="localValue"
          :min="0"
          :max="1"
          :step="0.1"
          :show-tooltip="true"
          @change="handleChange"
        />
        <span class="slider-value">{{ localValue }}</span>
      </div>
      
      <!-- 记忆配置 -->
      <div v-else-if="type === 'memoryConfig'" class="memory-config">
        <div class="memory-switch">
          <el-switch
            v-model="memoryConfigValue.enabled"
            @change="updateMemoryConfig"
          />
          <span class="memory-label">{{ t('flowComponents.enableMemory') }}</span>
        </div>
        <div v-if="memoryConfigValue.enabled" class="memory-rounds">
          <span class="rounds-label">{{ t('flowComponents.memoryRounds') }}</span>
          <el-input-number
            v-model="memoryConfigValue.rounds"
            :min="1"
            :max="20"
            @change="updateMemoryConfig"
            style="width: 120px"
          />
        </div>
      </div>

      <!-- 迷你富文本表达式编辑器（输入框呈现） -->
      <FullTextMiniExpressionUnit
        v-else-if="type === 'fullTextMiniExpression'"
        v-model="fullTextMiniExpressionValue"
        :placeholder="placeholder || t('flowComponents.enterText')"
        @change="handleChange"
      />

      <!-- JS表达式编辑器（单独字段） -->
      <JSExpressionUnit
        v-else-if="type === 'jsExpression'"
        v-model="localValue"
        :placeholder="placeholder || t('flowComponents.enterJSCode')"
        :rows="8"
        :lock-mode="true"
        @change="handleChange"
      />

      <!-- 赋值列表编辑器 -->
      <div
        v-else-if="type === 'assignments'"
        class="assignments-editor"
      >
        <div class="assignments-list">
          <div 
            v-for="(assignment, index) in assignmentsList"
            :key="assignment.id"
            class="assignment-item"
          >
            <div class="assignment-header">
              <el-select
                v-model="assignment.targetVariableName"
                :placeholder="t('flowComponents.selectSessionVariable')"
                size="small"
                class="variable-select"
                @change="updateAssignment"
              >
                <el-option
                  v-for="variable in variables"
                  :key="variable.id || variable.name"
                  :label="variable.name"
                  :value="variable.name"
                >
                  <span class="variable-option">
                    <span class="variable-name">{{ variable.name }}</span>
                    <span class="variable-type">{{ getVariableTypeLabel(variable.typeName) }}</span>
                  </span>
                </el-option>
              </el-select>
              <el-button
                type="danger"
                size="small"
                text
                :icon="Delete"
                @click="removeAssignment(index)"
                :title="t('flowComponents.deleteAssignment')"
              />
            </div>
            
            <JSExpressionUnit
              v-model="(assignment.expressionUnit as JSExpressionUnitType)"
              :placeholder="t('flowComponents.setExpressionOrFunction')"
              :rows="6"
              @change="updateAssignment"
            />
          </div>
        </div>
        
        <el-button
          type="primary"
          size="small"
          :icon="Plus"
          @click="addAssignment"
          class="add-assignment-btn"
        >
          {{ t('flowComponents.addAssignment') }}
        </el-button>
      </div>

      <!-- 默认文本输入 -->
      <el-input
        v-else
        v-model="localValue"
        :placeholder="placeholder"
        @input="handleChange"
        clearable
      />
      
      <p v-if="description" class="field-desc">{{ description }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Delete, Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import JSExpressionUnit from '../ExpressionUnits/JSExpressionUnit.vue';
import FullTextMiniExpressionUnit from '../ExpressionUnits/FullTextMiniExpressionUnit.vue';
import TextInputUnit from '../ExpressionUnits/TextInputUnit.vue';
import type { AnyVariable, VariableItemType } from '@/types/flow-designer/Parameters/Variable';
import type { ConditionRule } from '@/types/flow-designer/nodes/ConditionNode';
import type { AssignmentItem } from '@/types/flow-designer/nodes/AssignVariableNode';
import { ExpressionUnitFactory } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase';
import type { JSExpressionUnit as JSExpressionUnitType, FullTextMiniExpressionUnit as FullTextMiniExpressionUnitType } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase';
import { LLMProviderService } from '@/services/llmProvider.service';
import type { IFlowLLMProviderDto } from '@/types/llmProvider.types';

const { t } = useI18n();

// 选项接口
interface SelectOption {
  label: string;
  value: any;
}

// 组件属性
interface Props {
  label: string;           // 字段标签
  type?: string;          // 字段类型：text, textarea, number, boolean, select, conditions
  value?: any;            // 字段值
  placeholder?: string;   // 占位符
  description?: string;   // 字段描述
  options?: SelectOption[]; // 选择器选项（仅select类型使用）
  readonly?: boolean;     // 是否只读
  variables?: AnyVariable[]; // 可用变量列表（条件编辑器使用）
}

// 组件事件
interface Emits {
  (e: 'update:value', value: any): void;
  (e: 'change', value: any): void;
  (e: 'importCurl', value: any): void;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  placeholder: '',
  description: '',
  options: () => [],
  readonly: false,
  variables: () => []
});

const emit = defineEmits<Emits>();

// 本地值，用于双向绑定
const localValue = ref(props.value);

// cURL 导入对话框
const curlDialogVisible = ref(false);
const curlText = ref('');
const curlPlaceholder = `请粘贴 curl 命令，例如：
curl -X POST "https://api.example.com?name=abc" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"abc"}'`;

// 迷你富文本单元值（确保有默认对象）
const fullTextMiniExpressionValue = computed<FullTextMiniExpressionUnitType>({
  get: () => {
    if (props.type === 'fullTextMiniExpression') {
      if (!localValue.value) {
        const defaultUnit = ExpressionUnitFactory.createFullTextMiniExpression('');
        localValue.value = defaultUnit;
        emit('update:value', defaultUnit);
        return defaultUnit;
      }
      return localValue.value as FullTextMiniExpressionUnitType;
    }
    return (localValue.value as FullTextMiniExpressionUnitType) || ExpressionUnitFactory.createFullTextMiniExpression('');
  },
  set: (value) => {
    localValue.value = value;
  }
});

// 监听外部值变化
watch(() => props.value, (newValue) => {
  localValue.value = newValue;
}, { immediate: true });

import { parseCurlCommand } from '@/utils/curlParser';

// 处理值变化
const handleChange = (value: any) => {
  emit('update:value', value);
  emit('change', value);
};

const openCurlDialog = () => {
  curlText.value = '';
  curlDialogVisible.value = true;
};

const handleCurlConfirm = () => {
  const parsed = parseCurlCommand(curlText.value);
  if (parsed.method) {
    localValue.value = parsed.method;
    handleChange(parsed.method);
  }
  emit('importCurl', parsed);
  curlDialogVisible.value = false;
};

// 条件列表管理（仅当类型为 conditions 时使用）
const conditionsList = computed({
  get: () => {
    return props.type === 'conditions' && Array.isArray(localValue.value) 
      ? localValue.value as ConditionRule[]
      : [];
  },
  set: (newValue: ConditionRule[]) => {
    if (props.type === 'conditions') {
      localValue.value = newValue;
      emit('update:value', newValue);
      emit('change', newValue);
    }
  }
});

// 添加新条件
const addCondition = () => {
  const newCondition: ConditionRule = {
    id: `condition_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    expressionUnit: ExpressionUnitFactory.createJSExpression(''),
    description: t('flowComponents.condition') + ' ' + (conditionsList.value.length + 1)
  };
  
  conditionsList.value = [...conditionsList.value, newCondition];
};

// 删除条件
const removeCondition = (index: number) => {
  // 检查是否只剩一个条件，不允许删除最后一个条件
  if (conditionsList.value.length <= 1) {
    ElMessage.warning(t('flowComponents.atLeastOneCondition'));
    return;
  }
  
  const newList = [...conditionsList.value];
  newList.splice(index, 1);
  conditionsList.value = newList;
};

// 更新条件（当子组件值变化时触发）
const updateCondition = () => {
  // 触发变更事件，让父组件知道条件列表已更新
  emit('update:value', conditionsList.value);
  emit('change', conditionsList.value);
};

// 赋值列表管理（仅当类型为 assignments 时使用）
const assignmentsList = computed({
  get: () => {
    return props.type === 'assignments' && Array.isArray(localValue.value) 
      ? localValue.value as AssignmentItem[]
      : [];
  },
  set: (newValue: AssignmentItem[]) => {
    if (props.type === 'assignments') {
      localValue.value = newValue;
      emit('update:value', newValue);
      emit('change', newValue);
    }
  }
});

// 添加新赋值项
const addAssignment = () => {
  const newAssignment: AssignmentItem = {
    id: `assign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    targetVariableName: '',
    expressionUnit: ExpressionUnitFactory.createJSExpression('')
  };
  
  assignmentsList.value = [...assignmentsList.value, newAssignment];
};

// 删除赋值项
const removeAssignment = (index: number) => {
  // 检查是否只剩一个赋值项，不允许删除最后一个
  if (assignmentsList.value.length <= 1) {
    ElMessage.warning(t('flowComponents.atLeastOneAssignment'));
    return;
  }
  
  const newList = [...assignmentsList.value];
  newList.splice(index, 1);
  assignmentsList.value = newList;
};

// 更新赋值项（当子组件值变化时触发）
const updateAssignment = () => {
  // 触发变更事件，让父组件知道赋值列表已更新
  emit('update:value', assignmentsList.value);
  emit('change', assignmentsList.value);
};

// 获取变量类型标签
// 获取变量类型标签
const getVariableTypeLabel = (typeName: VariableItemType): string => {
  const typeMap: Record<VariableItemType, string> = {
    'LongVariable': 'Number',
    'DecimalVariable': 'Number',
    'StringVariable': 'String',
    'ObjectVariable': 'Object',
    'DateTimeVariable': 'DateTime',
    'BooleanVariable': 'Boolean',
    'ArrayVariable': 'Array'
  };
  return typeMap[typeName] || typeName;
};

// 模型提供者列表（用于模型选择器）
const modelProviders = ref<IFlowLLMProviderDto[]>([]);

// 加载模型提供者列表
const loadModelProviders = async () => {
  try {
    const response = await LLMProviderService.getProviderList();
    if (response.errCode === 0 && response.data) {
      modelProviders.value = response.data;
    }
  } catch (error) {
    console.error('加载模型提供者失败:', error);
  }
};

// 记忆配置值（用于memoryConfig类型）
const memoryConfigValue = computed({
  get: () => {
    if (props.type === 'memoryConfig' && typeof localValue.value === 'object') {
      return localValue.value as { enabled: boolean; rounds: number };
    }
    return { enabled: false, rounds: 5 };
  },
  set: (newValue) => {
    if (props.type === 'memoryConfig') {
      localValue.value = newValue;
    }
  }
});

// 更新记忆配置
const updateMemoryConfig = () => {
  emit('update:value', memoryConfigValue.value);
  emit('change', memoryConfigValue.value);
};

// 组件挂载时加载模型提供者
onMounted(() => {
  if (props.type === 'modelSelector') {
    loadModelProviders();
  }
});
</script>

<style scoped>
/* ── Field layout ── */
.property-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 14px;
}

.property-field:last-child {
  margin-bottom: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--nf-text-secondary);
  line-height: 1.3;
}

.field-desc {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--nf-text-muted);
  line-height: 1.4;
}

/* ── Element Plus compact overrides ── */
:deep(.el-input__wrapper) {
  border-radius: 6px;
  min-height: 32px;
}

:deep(.el-input__inner) {
  font-size: 13px;
  height: 32px;
  line-height: 32px;
}

:deep(.el-textarea__inner) {
  border-radius: 6px;
  font-size: 13px;
  min-height: 52px;
}

:deep(.el-select .el-input__wrapper) {
  border-radius: 6px;
  min-height: 32px;
}

:deep(.el-input-number__inner) {
  font-size: 13px;
  height: 32px;
}

/* ── Condition editor ── */
.conditions-editor {
  .conditions-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 10px;

    .condition-item {
      padding: 10px;
      border: 1px solid var(--nf-border);
      border-radius: 8px;
      background: var(--nf-bg-elevated);

      .condition-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;

        .condition-index {
          flex-shrink: 0;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--nf-accent);
          color: #fff;
          border-radius: 50%;
          font-size: 10px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .condition-description {
          flex: 1;
        }
      }
    }
  }

  .add-condition-btn {
    width: 100%;
    border-style: dashed;
    border-color: var(--nf-border-light);
    color: var(--nf-accent);
    background: transparent;
    transition: background-color 0.15s ease, border-color 0.15s ease;

    &:hover {
      background: var(--nf-accent-muted);
      border-color: var(--nf-accent);
    }
  }
}

/* ── Assignment editor ── */
.assignments-editor {
  .assignments-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 10px;

    .assignment-item {
      padding: 10px;
      border: 1px solid var(--nf-border);
      border-radius: 8px;
      background: var(--nf-bg-elevated);

      .assignment-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;

        .variable-select { flex: 1; }
      }
    }
  }

  .add-assignment-btn {
    width: 100%;
    border-style: dashed;
    border-color: var(--nf-border-light);
    color: var(--nf-accent2);
    background: transparent;
    transition: background-color 0.15s ease, border-color 0.15s ease;

    &:hover {
      background: rgba(8, 145, 178, 0.08);
      border-color: var(--nf-accent2);
    }
  }
}

/* ── Variable option dropdown ── */
.variable-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;

  .variable-name {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-weight: 500;
  }

  .variable-type {
    font-size: 11px;
    color: var(--nf-text-muted);
    padding: 1px 6px;
    background: var(--nf-bg-muted);
    border-radius: 3px;
  }
}

/* ── Slider ── */
.slider-container {
  display: flex;
  align-items: center;
  gap: 12px;

  .el-slider { flex: 1; }

  .slider-value {
    min-width: 36px;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--nf-text-secondary);
  }
}

/* ── Memory config ── */
.memory-config {
  .memory-switch {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;

    .memory-label {
      font-size: 12px;
      color: var(--nf-text-secondary);
      white-space: nowrap;
    }
  }

  .memory-rounds {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 8px;

    .rounds-label {
      font-size: 12px;
      color: var(--nf-text-secondary);
      white-space: nowrap;
      flex-shrink: 0;
    }
  }
}

/* ── HTTP method row ── */
.http-method-row {
  display: flex;
  gap: 8px;
  align-items: center;

  .http-method-select { width: 120px; }
  .http-curl-btn { flex-shrink: 0; }
}
</style>
