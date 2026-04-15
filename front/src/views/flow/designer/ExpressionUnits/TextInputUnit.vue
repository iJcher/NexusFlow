<template>
  <!-- 全屏遮罩 -->
  <div v-if="isFullscreen" class="fullscreen-backdrop" @click="toggleFullscreen"></div>
  
  <div :class="['text-input-unit-editor', { 'is-fullscreen': isFullscreen }]">
    <div class="editor-container" :class="{ 'is-fullscreen': isFullscreen }">
      <CodeMirrorEditor
        ref="editorRef"
        v-model="localValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        @change="handleInput"
      />
    </div>
    <div class="editor-toolbar">
      <span class="at-hint">@ 插入变量</span>
      <el-tooltip :content="isFullscreen ? t('flowComponents.exitFullscreen') : t('flowComponents.fullscreenEdit')" placement="top">
        <button type="button" class="toolbar-btn" @click="toggleFullscreen">
          <el-icon v-if="!isFullscreen"><FullScreen /></el-icon>
          <el-icon v-else><Close /></el-icon>
        </button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { FullScreen, Close } from '@element-plus/icons-vue';
import type { FullTextExpressionUnit } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase';
import CodeMirrorEditor from '../components/CodeMirrorEditor.vue';

const { t } = useI18n();

// 组件属性
interface Props {
  modelValue: FullTextExpressionUnit;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  rows?: number;
  title?: string;
}

// 组件事件
interface Emits {
  (e: 'update:modelValue', value: FullTextExpressionUnit): void;
  (e: 'change', value: FullTextExpressionUnit): void;
  (e: 'blur'): void;
  (e: 'focus'): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  disabled: false,
  readonly: false,
  rows: 4,
  title: ''
});

const emit = defineEmits<Emits>();

// 实际显示的标题（带默认值）
const displayTitle = computed(() => props.title || t('flowComponents.textInput'));

// 组件状态
const editorRef = ref();
const isFullscreen = ref(false);

// 本地值（操作 Text 属性）
const localValue = computed({
  get: () => props.modelValue.Text || '',
  set: (value: string) => {
    // 通过 emitUpdate 函数来处理更新
  }
});

// 事件处理：更新 Text 属性
const handleInput = (value: string) => {
  const updatedUnit: FullTextExpressionUnit = {
    ...props.modelValue,
    Text: value
  };
  emit('update:modelValue', updatedUnit);
  emit('change', updatedUnit);
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

.text-input-unit-editor {
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
    justify-content: flex-end;
    gap: 6px;
    padding: 2px 6px 4px;
    flex-shrink: 0;

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
  }
}
</style>
