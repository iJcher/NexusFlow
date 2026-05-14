<template>
  <div class="variable-manager">
    <!-- Header (single line) -->
    <div class="flex items-center justify-between gap-3 mb-3">
      <div class="flex items-center gap-2 min-w-0">
        <el-tag :type="config.tagType" size="small">
          {{ t('flowComponents.variableCount', { count: variables.length }) }}
        </el-tag>
      </div>
      <el-button
        type="primary"
        :icon="Plus"
        size="small"
        @click="showAddDialog"
      >
        {{ t('flowComponents.add' + (type === 'input' ? 'InputParameter' : 'SessionVariable')) }}
      </el-button>
    </div>

    <!-- Variable list -->
    <div class="variable-list">
      <el-empty
        v-if="variables.length === 0"
        :description="t('flowComponents.noVariables')"
        :image-size="80"
      />

      <div v-else class="flex flex-col gap-1.5">
        <div
          v-for="variable in variables"
          :key="variable.id || variable.name"
          class="variable-row flex items-center min-h-11 px-4 py-2.5 bg-nf-card border border-nf-border rounded-2"
          :class="config.cardClass"
        >
          <div class="flex items-center flex-1 min-w-0 gap-2">
            <el-icon :size="14" class="text-nf-text-secondary shrink-0">
              <component :is="getVariableIcon(variable.typeName)" />
            </el-icon>
            <span class="text-3.5 font-500 text-nf-text-primary shrink-0 truncate max-w-30">
              {{ variable.name }}
            </span>
            <el-tag :type="getVariableTagType(variable.typeName)" size="small">
              {{ getVariableTypeLabel(variable.typeName) }}
            </el-tag>
            <el-tag
              v-if="type === 'input'"
              :type="variable.required ? 'danger' : 'info'"
              size="small"
            >
              {{ variable.required ? t('flowComponents.required') : t('flowComponents.optional') }}
            </el-tag>
          </div>

          <div class="flex-1 px-3 min-w-0">
            <div
              v-if="variable.defaultValue !== undefined && variable.defaultValue !== null"
              class="text-3 text-nf-text-secondary truncate max-w-37.5"
              :title="formatDefaultValue(variable.defaultValue)"
            >
              {{ formatDefaultValue(variable.defaultValue) }}
            </div>
            <div v-else-if="hasChildren(variable)" class="text-3 text-nf-text-secondary">
              {{ t('flowComponents.childCount', { count: getChildrenCount(variable) }) }}
            </div>
            <div v-else class="text-3 text-nf-text-muted">{{ t('flowComponents.noDefault') }}</div>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <el-tooltip :content="t('common.edit')">
              <el-button
                type="primary"
                :icon="Edit"
                size="small"
                text
                @click="editVariable(variable)"
              />
            </el-tooltip>
            <el-tooltip :content="t('common.delete')">
              <el-button
                type="danger"
                :icon="Delete"
                size="small"
                text
                @click="deleteVariable(variable)"
              />
            </el-tooltip>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? t('flowComponents.edit' + (type === 'input' ? 'InputParameter' : 'SessionVariable')) : t('flowComponents.add' + (type === 'input' ? 'InputParameter' : 'SessionVariable'))"
      width="560px"
      append-to-body
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="84px"
      >
        <el-form-item :label="t('flowComponents.variableName')" prop="name">
          <el-input
            v-model="formData.name"
            :placeholder="t('flowComponents.enterVariableName')"
            :prefix-icon="Edit"
          />
        </el-form-item>

        <el-form-item :label="t('flowComponents.variableType')" prop="typeName">
          <el-select
            v-model="formData.typeName"
            :placeholder="t('flowComponents.selectVariableType')"
            class="w-full"
            @change="onTypeChange"
          >
            <el-option
              v-for="type in variableTypes"
              :key="type.value"
              :label="type.label"
              :value="type.value"
            >
              <div class="flex items-center gap-2">
                <el-icon :size="14">
                  <component :is="type.icon" />
                </el-icon>
                <span>{{ type.label }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item v-if="type === 'input'" :label="t('flowComponents.isRequired')">
          <el-switch v-model="formData.required" />
        </el-form-item>

        <el-form-item v-if="showDefaultValue" :label="t('flowComponents.defaultValue')">
          <el-input
            v-if="formData.typeName === 'StringVariable'"
            v-model="formData.defaultValue"
            :placeholder="getDefaultValuePlaceholder()"
            clearable
            class="w-full"
          />
          <el-input-number
            v-else-if="formData.typeName === 'LongVariable'"
            v-model="formData.defaultValue"
            :placeholder="getDefaultValuePlaceholder()"
            :precision="0"
            controls-position="right"
            class="w-full"
          />
          <el-input-number
            v-else-if="formData.typeName === 'DecimalVariable'"
            v-model="formData.defaultValue"
            :placeholder="getDefaultValuePlaceholder()"
            :precision="2"
            :step="0.1"
            controls-position="right"
            class="w-full"
          />
          <el-switch
            v-else-if="formData.typeName === 'BooleanVariable'"
            v-model="formData.defaultValue"
          />
          <el-date-picker
            v-else-if="formData.typeName === 'DateTimeVariable'"
            v-model="formData.defaultValue"
            type="datetime"
            :placeholder="getDefaultValuePlaceholder()"
            class="w-full"
          />
        </el-form-item>

        <!-- Object variable children -->
        <el-form-item v-if="formData.typeName === 'ObjectVariable'" :label="t('flowComponents.childProperties')">
          <div class="children-manager w-full p-3 bg-nf-elevated border border-nf-border rounded-2">
            <el-button
              type="primary"
              :icon="Plus"
              size="small"
              text
              @click="addChildProperty"
            >
              {{ t('flowComponents.addProperty') }}
            </el-button>
            <div
              v-for="(child, index) in formData.children"
              :key="index"
              class="flex items-center gap-2 mt-2"
            >
              <el-input
                v-model="child.name"
                :placeholder="t('flowComponents.propertyName')"
                size="small"
                class="w-30"
              />
              <el-select
                v-model="child.typeName"
                :placeholder="t('flowComponents.variableType')"
                size="small"
                class="w-30"
              >
                <el-option
                  v-for="type in simpleVariableTypes"
                  :key="type.value"
                  :label="type.label"
                  :value="type.value"
                />
              </el-select>
              <el-switch v-if="props.type === 'input'" v-model="child.required" size="small" />
              <el-button
                type="danger"
                :icon="Delete"
                size="small"
                text
                @click="removeChildProperty(index)"
              />
            </div>
          </div>
        </el-form-item>

        <!-- Array element type -->
        <el-form-item v-if="formData.typeName === 'ArrayVariable'" :label="t('flowComponents.elementType')">
          <el-select
            v-model="formData.itemType"
            :placeholder="t('flowComponents.selectElementType')"
            class="w-full"
          >
            <el-option
              v-for="type in variableTypes"
              :key="type.value"
              :label="type.label"
              :value="type.value"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitForm">
          {{ isEditing ? t('flowComponents.update') : t('flowComponents.add') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { 
  Plus, Edit, Delete, 
  Document, Clock, Switch, Coin, 
  Calendar, Collection, Grid
} from '@element-plus/icons-vue';
import type { 
  AnyVariable, 
  VariableItemType, 
  StringVariable, 
  LongVariable, 
  DecimalVariable, 
  BooleanVariable, 
  DateTimeVariable, 
  ObjectVariable, 
  ArrayVariable 
} from '@/types/flow-designer/Parameters/Variable';
import { VariableFactory } from '@/types/flow-designer/Parameters/Variable';

const { t } = useI18n();

type ElementTagType = 'success' | 'info' | 'primary' | 'warning' | 'danger';

// Props 定义
interface Props {
  /** 变量类型：'input' | 'session' */
  type: 'input' | 'session';
  /** 变量列表 */
  variables: AnyVariable[];
  /** 所有变量列表（用于唯一性检查） */
  allVariables?: AnyVariable[];
}

const props = withDefaults(defineProps<Props>(), {
  type: 'input',
  variables: () => []
});

// Emits 定义
const emit = defineEmits<{
  'update:variables': [variables: AnyVariable[]];
  'add': [variable: AnyVariable];
  'update': [variable: AnyVariable];
  'delete': [variable: AnyVariable];
}>();

const config = computed(() => {
  const isInput = props.type === 'input';
  return {
    tagType: (isInput ? 'primary' : 'success') as ElementTagType,
    cardClass: isInput ? 'input-card' : 'session-card',
  };
});

// 表单相关
const dialogVisible = ref(false);
const isEditing = ref(false);
const editingIndex = ref(-1);
const originalVariableName = ref<string>('');
const formRef = ref<FormInstance>();

// 表单数据
const formData = reactive<{
  name: string;
  typeName: VariableItemType;
  required: boolean;
  defaultValue: any;
  children: Array<{ name: string; typeName: VariableItemType; required: boolean }>;
  itemType?: VariableItemType;
}>({
  name: '',
  typeName: 'StringVariable' as VariableItemType,
  required: false,
  defaultValue: undefined,
  children: [],
  itemType: undefined
});

// 表单验证规则
const formRules: FormRules = {
  name: [
    { required: true, message: t('flowComponents.enterVariableName'), trigger: 'blur' },
    { 
      validator: (rule, value, callback) => {
        if (!value) {
          callback();
          return;
        }
        
        // 检查变量名格式
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
          callback(new Error(t('flowComponents.variableNameInvalid')));
          return;
        }
        
        // 检查唯一性
        const allVars = props.allVariables || [];
        const existingVar = allVars.find(v => v.name === value);
        
        // 编辑模式下，如果是当前正在编辑的变量，则允许
        if (isEditing.value && existingVar && originalVariableName.value === value) {
          callback();
          return;
        }
        
        // 检查是否重名
        if (existingVar) {
          callback(new Error(t('flowComponents.variableNameExists')));
          return;
        }
        
        callback();
      }, 
      trigger: 'blur' 
    }
  ],
  typeName: [
    { required: true, message: t('flowComponents.selectVariableType'), trigger: 'change' }
  ]
};

// 变量类型选项
const variableTypes = [
  { label: t('flowComponents.string'), value: 'StringVariable', icon: Document },
  { label: t('flowComponents.number'), value: 'LongVariable', icon: Coin },
  { label: t('flowComponents.decimal'), value: 'DecimalVariable', icon: Coin },
  { label: t('flowComponents.boolean'), value: 'BooleanVariable', icon: Switch },
  { label: t('flowComponents.dateTime'), value: 'DateTimeVariable', icon: Calendar },
  { label: t('flowComponents.object'), value: 'ObjectVariable', icon: Collection },
  { label: t('flowComponents.array'), value: 'ArrayVariable', icon: Grid }
];

// 简单类型（用于对象属性）
const simpleVariableTypes = variableTypes.filter(t => 
  !['ObjectVariable', 'ArrayVariable'].includes(t.value)
);

// 是否显示默认值输入
const showDefaultValue = computed(() => {
  return !['ObjectVariable', 'ArrayVariable'].includes(formData.typeName);
});

// 获取变量图标
const getVariableIcon = (typeName: VariableItemType) => {
  const typeMap = {
    StringVariable: Document,
    LongVariable: Coin,
    DecimalVariable: Coin,
    BooleanVariable: Switch,
    DateTimeVariable: Calendar,
    ObjectVariable: Collection,
    ArrayVariable: Grid
  };
  return typeMap[typeName] || Document;
};

// 获取变量标签类型
const getVariableTagType = (typeName: VariableItemType): ElementTagType => {
  const typeMap: Record<VariableItemType, ElementTagType> = {
    StringVariable: 'primary',
    LongVariable: 'success',
    DecimalVariable: 'success',
    BooleanVariable: 'warning',
    DateTimeVariable: 'info',
    ObjectVariable: 'danger',
    ArrayVariable: 'danger'
  };
  return typeMap[typeName] || 'primary';
};

// 获取变量类型标签
const getVariableTypeLabel = (typeName: VariableItemType) => {
  const typeMap: Record<VariableItemType, string> = {
    StringVariable: t('flowComponents.string'),
    LongVariable: t('flowComponents.number'),
    DecimalVariable: t('flowComponents.decimal'),
    BooleanVariable: t('flowComponents.boolean'),
    DateTimeVariable: t('flowComponents.dateTime'),
    ObjectVariable: t('flowComponents.object'),
    ArrayVariable: t('flowComponents.array')
  };
  return typeMap[typeName] || t('flowComponents.unknown');
};

// 格式化默认值显示
const formatDefaultValue = (value: any) => {
  if (value === null || value === undefined) return t('flowComponents.noDefault');
  
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  
  return String(value);
};

// 检查是否有子项
const hasChildren = (variable: AnyVariable) => {
  return variable.typeName === 'ObjectVariable' || variable.typeName === 'ArrayVariable';
};

// 获取子项数量
const getChildrenCount = (variable: AnyVariable) => {
  if (variable.typeName === 'ObjectVariable' || variable.typeName === 'ArrayVariable') {
    return (variable as ObjectVariable | ArrayVariable).children?.length || 0;
  }
  return 0;
};

// 获取默认值占位符
const getDefaultValuePlaceholder = () => {
  switch (formData.typeName) {
    case 'StringVariable':
      return t('flowComponents.enterDefaultStringValue');
    case 'LongVariable':
      return t('flowComponents.enterDefaultNumberValue');
    case 'DecimalVariable':
      return t('flowComponents.enterDefaultDecimalValue');
    case 'DateTimeVariable':
      return t('flowComponents.selectDefaultDateTime');
    default:
      return t('flowComponents.enterDefaultValue');
  }
};

// 显示添加对话框
const showAddDialog = () => {
  isEditing.value = false;
  editingIndex.value = -1;
  resetForm();
  dialogVisible.value = true;
};

// 编辑变量
const editVariable = (variable: AnyVariable) => {
  isEditing.value = true;
  editingIndex.value = props.variables.findIndex(v => v.name === variable.name);
  
  // 存储原始变量名，用于验证时判断是否是同一个变量
  originalVariableName.value = variable.name;
  
  // 填充表单数据
  formData.name = variable.name;
  formData.typeName = variable.typeName;
  formData.required = variable.required || false;
  formData.defaultValue = variable.defaultValue;
  
  if (variable.typeName === 'ObjectVariable') {
    formData.children = (variable as ObjectVariable).children?.map(child => ({
      name: child.name,
      typeName: child.typeName,
      required: child.required || false
    })) || [];
  } else if (variable.typeName === 'ArrayVariable') {
    formData.itemType = (variable as ArrayVariable).itemType;
    formData.children = (variable as ArrayVariable).children?.map(child => ({
      name: child.name,
      typeName: child.typeName,
      required: child.required || false
    })) || [];
  } else {
    formData.children = [];
  }
  
  dialogVisible.value = true;
};

// 删除变量
const deleteVariable = async (variable: AnyVariable) => {
  try {
    await ElMessageBox.confirm(
      t('flowComponents.deleteConfirm', { name: variable.name }),
      t('flowComponents.deleteConfirmTitle'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    );
    
    emit('delete', variable);
    ElMessage.success(t('flowComponents.deleteSuccess'));
  } catch {
    // 用户取消删除
  }
};

// 类型变化处理
const onTypeChange = () => {
  formData.defaultValue = undefined;
  formData.children = [];
  formData.itemType = undefined;
};

// 添加子属性
const addChildProperty = () => {
  formData.children.push({
    name: '',
    typeName: 'StringVariable' as VariableItemType,
    required: false
  });
};

// 删除子属性
const removeChildProperty = (index: number) => {
  formData.children.splice(index, 1);
};

// 重置表单
const resetForm = () => {
  formData.name = '';
  formData.typeName = 'StringVariable' as VariableItemType;
  formData.required = false;
  formData.defaultValue = undefined;
  formData.children = [];
  formData.itemType = undefined;
  originalVariableName.value = '';
  formRef.value?.resetFields();
};

// 提交表单
const submitForm = async () => {
  if (!formRef.value) return;
  
  await formRef.value.validate();
  
  // 创建变量对象
  let variable: AnyVariable;
  
  switch (formData.typeName) {
    case 'StringVariable':
      variable = VariableFactory.createStringVariable(
        formData.name, 
        formData.required, 
        formData.defaultValue
      );
      break;
      
    case 'LongVariable':
      variable = VariableFactory.createLongVariable(
        formData.name, 
        formData.required, 
        formData.defaultValue
      );
      break;
      
    case 'DecimalVariable':
      variable = VariableFactory.createDecimalVariable(
        formData.name, 
        formData.required, 
        formData.defaultValue
      );
      break;
      
    case 'BooleanVariable':
      variable = VariableFactory.createBooleanVariable(
        formData.name, 
        formData.required, 
        formData.defaultValue
      );
      break;
      
    case 'DateTimeVariable':
      variable = VariableFactory.createDateTimeVariable(
        formData.name, 
        formData.required, 
        formData.defaultValue
      );
      break;
      
    case 'ObjectVariable':
      // 将子属性转换为变量对象
      const children = formData.children.map(child => {
        switch (child.typeName) {
          case 'StringVariable':
            return VariableFactory.createStringVariable(child.name, child.required);
          case 'LongVariable':
            return VariableFactory.createLongVariable(child.name, child.required);
          case 'DecimalVariable':
            return VariableFactory.createDecimalVariable(child.name, child.required);
          case 'BooleanVariable':
            return VariableFactory.createBooleanVariable(child.name, child.required);
          case 'DateTimeVariable':
            return VariableFactory.createDateTimeVariable(child.name, child.required);
          default:
            return VariableFactory.createStringVariable(child.name, child.required);
        }
      });
      
      variable = VariableFactory.createObjectVariable(
        formData.name, 
        children, 
        formData.required, 
        formData.defaultValue
      );
      break;
      
    case 'ArrayVariable':
      variable = VariableFactory.createArrayVariable(
        formData.name, 
        formData.itemType || 'StringVariable' as VariableItemType, 
        formData.required, 
        formData.children.map(child => {
          switch (child.typeName) {
            case 'StringVariable':
              return VariableFactory.createStringVariable(child.name, child.required);
            case 'LongVariable':
              return VariableFactory.createLongVariable(child.name, child.required);
            case 'DecimalVariable':
              return VariableFactory.createDecimalVariable(child.name, child.required);
            case 'BooleanVariable':
              return VariableFactory.createBooleanVariable(child.name, child.required);
            case 'DateTimeVariable':
              return VariableFactory.createDateTimeVariable(child.name, child.required);
            default:
              return VariableFactory.createStringVariable(child.name, child.required);
          }
        }), 
        formData.defaultValue
      );
      break;
      
    default:
      variable = VariableFactory.createStringVariable(formData.name, formData.required);
  }
  
  if (isEditing.value) {
    emit('update', variable);
    ElMessage.success(t('flowComponents.updateSuccess'));
  } else {
    emit('add', variable);
    ElMessage.success(t('flowComponents.addSuccess'));
  }
  
  dialogVisible.value = false;
  resetForm();
};
</script>

<style scoped lang="scss">
/* hover/border-left 走 SCSS：这些复杂状态原子类不好表达 */
.variable-row {
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    border-color: rgba(0, 255, 159, 0.35);
    box-shadow: var(--nf-glow-sm);
  }

  &.input-card {
    border-left: 3px solid var(--nf-accent);
  }

  &.session-card {
    border-left: 3px solid var(--nf-accent2);
  }
}
</style>
