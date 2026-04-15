<template>
  <!-- 全屏遮罩 -->
  <div v-if="isFullscreen" class="fullscreen-backdrop" @click="toggleFullscreen"></div>
  
  <div :class="['js-expression-unit-editor', { 'is-fullscreen': isFullscreen }]">
    <!-- 代码编辑区域 -->
    <div class="editor-container" :class="{ 'is-fullscreen': isFullscreen }">
      <CodeMirrorEditor
        ref="editorRef"
        v-model="localCode"
        :placeholder="currentPlaceholder"
        :disabled="disabled"
        :readonly="readonly"
        @change="handleInput"
      />
    </div>
    <!-- 底部工具栏 -->
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <el-radio-group 
          v-if="!lockMode"
          v-model="currentMode" 
          size="small"
          @change="handleModeChange"
          class="mode-switch"
        >
          <el-radio-button label="expression">{{ t('flowComponents.expressionMode') }}</el-radio-button>
          <el-radio-button label="function">{{ t('flowComponents.functionMode') }}</el-radio-button>
        </el-radio-group>
        <span v-else class="mode-locked">
          {{ currentMode === 'function' ? t('flowComponents.functionMode') : t('flowComponents.expressionMode') }}
        </span>
      </div>
      <div class="toolbar-right">
        <span class="at-hint">@ 插入变量</span>
        <el-popover placement="top-start" :width="360" trigger="hover">
          <template #reference>
            <button type="button" class="toolbar-btn"><el-icon><QuestionFilled /></el-icon></button>
          </template>
          <div class="help-content">
            <div class="help-section">
              <div class="help-title">{{ t('flowComponents.expressionMode') }}</div>
              <div class="help-text">{{ t('flowComponents.expressionModeHelp') }}</div>
            </div>
            <div class="help-section">
              <div class="help-title">{{ t('flowComponents.functionMode') }}</div>
              <div class="help-text">{{ t('flowComponents.functionModeHelp') }}</div>
            </div>
            <div class="help-section">
              <div class="help-title">{{ t('flowComponents.variableUsage') }}</div>
              <div class="help-text">{{ t('flowComponents.variableUsageHelp') }}</div>
            </div>
          </div>
        </el-popover>
        <el-tooltip :content="isFullscreen ? t('flowComponents.exitFullscreen') : t('flowComponents.fullscreenEdit')" placement="top">
          <button type="button" class="toolbar-btn" @click="toggleFullscreen">
            <el-icon v-if="!isFullscreen"><FullScreen /></el-icon>
            <el-icon v-else><Close /></el-icon>
          </button>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { FullScreen, Close, QuestionFilled } from '@element-plus/icons-vue';
import type { JSExpressionUnit } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase';
import CodeMirrorEditor from '../components/CodeMirrorEditor.vue';

const { t } = useI18n();

// 组件属性
interface Props {
  modelValue: JSExpressionUnit;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  rows?: number;
  lockMode?: boolean; // 是否锁定模式，禁用模式切换
}

// 组件事件
interface Emits {
  (e: 'update:modelValue', value: JSExpressionUnit): void;
  (e: 'change', value: JSExpressionUnit): void;
  (e: 'blur'): void;
  (e: 'focus'): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  disabled: false,
  readonly: false,
  rows: 8,
  lockMode: false
});

const emit = defineEmits<Emits>();


// 组件状态
const editorRef = ref();
const isFullscreen = ref(false);

// 当前模式
const currentMode = ref<'expression' | 'function'>(
  props.modelValue.isFunctionMode ? 'function' : 'expression'
);

// 当前代码（基于模式动态获取对应字段）
const localCode = computed({
  get: () => {
    return currentMode.value === 'function' 
      ? props.modelValue.functionCode || ''
      : props.modelValue.expressionCode || '';
  },
  set: (value: string) => {
    // 通过 emitUpdate 函数来处理更新
  }
});

// 默认模板
const expressionTemplate = '';
const functionTemplate = `function main() {
  // 可以使用变量，例如：{{age}} > 18
  return true;
}`;

// 当前占位符
const currentPlaceholder = computed(() => {
  return props.placeholder || (
    currentMode.value === 'expression' 
      ? t('flowComponents.enterJSExpression')
      : t('flowComponents.enterJSFunction')
  );
});


// 初始化：如果代码为空，使用默认模板
onMounted(() => {
  const currentCode = currentMode.value === 'function' 
    ? props.modelValue.functionCode 
    : props.modelValue.expressionCode;
  
  if (!currentCode) {
    const defaultCode = currentMode.value === 'expression' ? expressionTemplate : functionTemplate;
    emitUpdate(defaultCode);
  }
});

// 监听外部值变化
watch(() => props.modelValue, (newValue) => {
  currentMode.value = newValue.isFunctionMode ? 'function' : 'expression';
}, { deep: true });

// 处理模式切换
const handleModeChange = (mode: string | number) => {
  const isFunctionMode = mode === 'function';
  
  // 获取切换后模式的代码
  const targetCode = isFunctionMode 
    ? props.modelValue.functionCode 
    : props.modelValue.expressionCode;
  
  // 如果目标模式的代码为空，填充默认模板
  const codeToUse = targetCode || (isFunctionMode ? functionTemplate : expressionTemplate);
  
  emitUpdate(codeToUse, isFunctionMode);
};

// 发送更新事件
const emitUpdate = (code: string, isFunctionMode?: boolean) => {
  const isFunction = isFunctionMode !== undefined ? isFunctionMode : currentMode.value === 'function';
  
  const updatedValue: JSExpressionUnit = {
    ...props.modelValue,
    functionCode: isFunction ? code : props.modelValue.functionCode,
    expressionCode: isFunction ? props.modelValue.expressionCode : code,
    isFunctionMode: isFunction
  };
  emit('update:modelValue', updatedValue);
  emit('change', updatedValue);
};

// 事件处理
const handleInput = (value: string) => {
  emitUpdate(value);
};

const handleBlur = () => {
  emit('blur');
};

const handleFocus = () => {
  emit('focus');
};

// 切换全屏模式
const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value;
};
</script>

<style scoped lang="scss">
.fullscreen-backdrop {
  position: fixed;
  inset: 0;
  background: var(--nf-overlay);
  z-index: 8888;
}

.js-expression-unit-editor {
  border: 1px solid var(--nf-border);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  background: var(--nf-bg-card);

  &:focus-within {
    border-color: var(--nf-accent);
    box-shadow: 0 0 0 2px var(--nf-accent-muted);
  }

  &.is-fullscreen {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 80vw;
    max-width: 1200px;
    height: 80vh;
    z-index: 9999;
    background: var(--nf-bg-base);
    border-radius: 12px;
    box-shadow: var(--nf-shadow-lg);
    display: flex;
    flex-direction: column;

    .editor-container {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
  }

  .editor-container {
    position: relative;
    padding: 2px;

    &.is-fullscreen {
      flex: 1;
      overflow: hidden;

      :deep(.codemirror-editor-wrapper),
      :deep(.codemirror-editor),
      :deep(.cm-editor) {
        height: 100%;
      }
    }
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 6px 4px;
    flex-shrink: 0;

    .toolbar-left {
      display: flex;
      align-items: center;
    }

    .toolbar-right {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .at-hint {
      font-size: 11px;
      color: var(--nf-text-muted);
      opacity: 0.6;
      white-space: nowrap;
    }

    .toolbar-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--nf-text-muted);
      cursor: pointer;
      transition: color 0.15s ease, background-color 0.15s ease;
      padding: 0;

      &:hover {
        color: var(--nf-text-primary);
        background: var(--nf-bg-muted);
      }

      .el-icon { font-size: 13px; }
    }

    .mode-locked {
      font-size: 10px;
      font-weight: 500;
      color: var(--nf-text-muted);
      padding: 2px 8px;
      background: var(--nf-bg-muted);
      border-radius: 4px;
    }

    .mode-switch {
      background: var(--nf-bg-muted);
      border-radius: 6px;
      padding: 2px;

      :deep(.el-radio-button:first-child .el-radio-button__inner) {
        border-left: none;
      }

      :deep(.el-radio-button__inner) {
        background-color: transparent;
        border: none;
        color: var(--nf-text-secondary);
        font-size: 11px;
        padding: 3px 10px;
        box-shadow: none;
        transition: color 0.15s ease, background-color 0.15s ease;
        font-weight: 500;

        &:hover { color: var(--nf-text-primary); }
      }

      :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
        background-color: var(--nf-bg-card);
        color: var(--nf-accent);
        font-weight: 600;
        box-shadow: var(--nf-shadow);
      }

      :deep(.el-radio-button:first-child .el-radio-button__inner),
      :deep(.el-radio-button:last-child .el-radio-button__inner) {
        border-radius: 4px;
      }
    }
  }
}

.help-content {
  padding: 6px 0;

  .help-section {
    padding: 6px 0;

    &:not(:last-child) {
      border-bottom: 1px solid var(--nf-border);
    }

    .help-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--nf-text-primary);
      margin-bottom: 4px;
    }

    .help-text {
      font-size: 11px;
      color: var(--nf-text-secondary);
      line-height: 1.5;
    }
  }
}
</style>
