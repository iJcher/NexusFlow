<template>
  <Transition name="cfg-slide">
    <aside
      v-if="visible"
      class="cfg-panel"
      role="complementary"
      :aria-label="t('flowComponents.nodeProperties')"
    >
      <!-- Header -->
      <header class="cfg-header">
        <div class="cfg-header-info">
          <el-icon
            v-if="flowStore.selectedNode"
            class="cfg-node-icon"
            :size="18"
          >
            <component :is="getNodeIcon(flowStore.selectedNode.type)" />
          </el-icon>
          <div class="cfg-header-text">
            <span class="cfg-node-name">
              {{ flowStore.selectedNode ? getNodeDisplayName(flowStore.selectedNode.type) : t('flowComponents.nodeProperties') }}
            </span>
            <span v-if="flowStore.selectedNode" class="cfg-node-type">{{ flowStore.selectedNode.type }}</span>
          </div>
        </div>
        <button
          type="button"
          class="cfg-close"
          aria-label="Close panel"
          @click="handleClose"
        >
          <Close class="w-4 h-4" />
        </button>
      </header>

      <!-- Body -->
      <div v-if="flowStore.selectedNode" class="cfg-body">
        <el-form :model="editableProperties" label-position="top" class="cfg-form">
          <section class="cfg-section">
            <h4 class="cfg-section-label">{{ t('flowComponents.basicProperties') }}</h4>
            <NodePropertiesPanelSingleField
              :label="t('flowComponents.displayName')"
              :value="editableProperties.displayName"
              :placeholder="t('flowComponents.enterDisplayName')"
              :description="t('flowComponents.nodeDisplayNameDesc')"
              @update:value="updateProperty('displayName', $event)"
            />
          </section>

          <section v-if="nodeSpecificFields.length > 0" class="cfg-section">
            <h4 class="cfg-section-label">{{ t('flowComponents.nodeConfiguration') }}</h4>
            <NodePropertiesPanelSingleField
              v-for="field in nodeSpecificFields"
              :key="field.key"
              :label="field.label"
              :type="field.type"
              :value="editableProperties[field.key]"
              :placeholder="field.placeholder"
              :description="field.description"
              :options="field.options"
              :variables="field.variables"
              @update:value="updateProperty(field.key, $event)"
              @importCurl="handleFieldImportCurl(field, $event)"
            />
          </section>
        </el-form>

        <section class="cfg-section">
          <NodePropertiesOutPutPanel
            :has-output="editableProperties.hasOutput || false"
            :outputs="editableProperties.outputs || []"
            :is-editable="isOutputEditable"
            @change="updateProperty('outputs', $event)"
          />
        </section>
      </div>

      <div v-else class="cfg-empty">
        <el-empty :description="t('flowComponents.selectNode')" :image-size="64" />
      </div>

      <!-- Footer -->
      <footer class="cfg-footer">
        <button type="button" class="cfg-btn cfg-btn-ghost" @click="handleClose">
          {{ t('flowComponents.cancel') }}
        </button>
        <button type="button" class="cfg-btn cfg-btn-solid" @click="handleSave">
          {{ t('flowComponents.save') }}
        </button>
      </footer>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { VideoPlay, ChatDotRound, Share, EditPen, MagicStick, Document, Refresh, Link, Close, Promotion, Collection } from '@element-plus/icons-vue';
import NodePropertiesPanelSingleField from './NodePropertiesPanelSingleField.vue';
import NodePropertiesOutPutPanel from './NodePropertiesOutPutPanel.vue';
import { useFlowDesignerStore } from '@/stores/flowDesigner';
import { ExpressionUnitFactory } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase';

const { t } = useI18n();

interface PropertyFieldConfig {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
  description?: string;
  options?: Array<{ label: string; value: any }>;
  variables?: any[];
}

interface Props {
  visible: boolean;
}

interface Emits {
  (e: 'update:visible', visible: boolean): void;
  (e: 'save', nodeId: string, properties: any): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const flowStore = useFlowDesignerStore();

const editableProperties = ref<any>({});

watch(() => flowStore.selectedNode, (newNode) => {
  if (newNode) {
    editableProperties.value = JSON.parse(JSON.stringify(newNode.properties || {}));
    if (!editableProperties.value.id) {
      editableProperties.value.id = newNode.id;
    }
    if (!editableProperties.value.displayName) {
      editableProperties.value.displayName = getNodeDisplayName(newNode.type);
    }

    if (newNode.type === 'LLMNode') {
      editableProperties.value.memoryConfig = {
        enabled: editableProperties.value.memoryEnabled || false,
        rounds: editableProperties.value.memoryRounds || 5
      };
    }
  } else {
    editableProperties.value = {};
  }
}, { immediate: true, deep: true });

const getNodeDisplayName = (nodeType: string): string => {
  const keyMap: Record<string, string> = {
    'StartNode': 'flowComponents.nodeStart',
    'ReplyNode': 'flowComponents.nodeReply',
    'ConditionNode': 'flowComponents.nodeCondition',
    'ForLoopNode': 'flowComponents.nodeForLoop',
    'AssignVariableNode': 'flowComponents.nodeAssign',
    'LLMNode': 'flowComponents.nodeLLM',
    'JSCodeNode': 'flowComponents.nodeJSCode',
    'HttpNode': 'flowComponents.nodeHTTP',
    'ResultNode': 'flowComponents.nodeResult',
    'KnowledgeNode': 'flowComponents.nodeKnowledge',
  };
  const key = keyMap[nodeType];
  return key ? t(key) : nodeType;
};

const getNodeIcon = (nodeType: string) => {
  const iconMap: Record<string, any> = {
    'StartNode': VideoPlay,
    'ReplyNode': ChatDotRound,
    'ConditionNode': Share,
    'ForLoopNode': Refresh,
    'AssignVariableNode': EditPen,
    'LLMNode': MagicStick,
    'JSCodeNode': Document,
    'HttpNode': Link,
    'ResultNode': Promotion,
    'KnowledgeNode': Collection,
  };
  return iconMap[nodeType] || VideoPlay;
};


const nodeSpecificFields = computed((): PropertyFieldConfig[] => {
  if (!flowStore.selectedNode) return [];

  const nodeType = flowStore.selectedNode.type;

  switch (nodeType) {
    case 'StartNode':
      return [];

    case 'ReplyNode':
      return [
        {
          key: 'message',
          label: '回复内容',
          type: 'textInput',
          placeholder: '请输入回复消息内容，使用 {{变量名}} 引用变量',
          description: '回复给用户的消息内容，可以使用 {{变量名}} 引用变量'
        }
      ];

    case 'ConditionNode':
      return [
        {
          key: 'conditions',
          label: t('flowComponents.conditionList'),
          type: 'conditions',
          description: t('flowComponents.conditionListDesc'),
          variables: flowStore.currentInputParameters.concat(flowStore.currentSessionVariables)
        },
        {
          key: 'defaultDescription',
          label: t('flowComponents.defaultBranch'),
          type: 'text',
          placeholder: t('flowComponents.enterDefaultBranchDesc'),
          description: t('flowComponents.defaultBranchDesc')
        }
      ];

    case 'ForLoopNode':
      return [
        {
          key: 'loopCount',
          label: t('flowComponents.loopCount'),
          type: 'jsExpression',
          placeholder: t('flowComponents.enterLoopCount'),
          description: t('flowComponents.loopCountDesc'),
          variables: flowStore.currentInputParameters.concat(flowStore.currentSessionVariables)
        }
      ];

    case 'AssignVariableNode':
      return [
        {
          key: 'assignments',
          label: t('flowComponents.assignmentList'),
          type: 'assignments',
          description: t('flowComponents.assignmentListDesc'),
          variables: flowStore.currentSessionVariables
        }
      ];

    case 'LLMNode':
      return [
        {
          key: 'modelSelection',
          label: t('flowComponents.modelSelection'),
          type: 'modelSelector',
          placeholder: t('flowComponents.selectLLMModel'),
          description: t('flowComponents.modelSelectionDesc')
        },
        {
          key: 'temperature',
          label: t('flowComponents.temperature'),
          type: 'slider',
          description: t('flowComponents.temperatureDesc')
        },
        {
          key: 'systemPrompt',
          label: t('flowComponents.systemPrompt'),
          type: 'textInput',
          placeholder: t('flowComponents.enterSystemPrompt'),
          description: t('flowComponents.systemPromptDesc')
        },
        {
          key: 'userPrompt',
          label: t('flowComponents.userPrompt'),
          type: 'textInput',
          placeholder: t('flowComponents.enterUserPrompt'),
          description: t('flowComponents.userPromptDesc')
        },
        {
          key: 'memoryConfig',
          label: t('flowComponents.memoryConfig'),
          type: 'memoryConfig',
          description: t('flowComponents.memoryConfigDesc')
        },
        {
          key: 'enableThinking',
          label: t('flowComponents.enableThinking'),
          type: 'boolean',
          description: t('flowComponents.enableThinkingDesc')
        },
        {
          key: 'pictures',
          label: t('flowComponents.pictures'),
          type: 'jsExpression',
          placeholder: t('flowComponents.enterPictures'),
          description: t('flowComponents.picturesDesc') + '\nFormat example: [ {url: ""}, {url: ""} ]'
        }
      ];

    case 'KnowledgeNode':
      return [
        {
          key: 'knowledgeBaseIds',
          label: t('flowComponents.knowledgeBaseSelect'),
          type: 'text',
          placeholder: t('flowComponents.knowledgeBaseSelectPlaceholder'),
          description: t('flowComponents.knowledgeBaseSelectDesc')
        },
        {
          key: 'queryExpression',
          label: t('flowComponents.knowledgeQuery'),
          type: 'textInput',
          placeholder: '{{sys.query}}',
          description: t('flowComponents.knowledgeQueryDesc')
        },
        {
          key: 'topK',
          label: t('flowComponents.knowledgeTopK'),
          type: 'number',
          placeholder: '5',
          description: t('flowComponents.knowledgeTopKDesc')
        },
        {
          key: 'threshold',
          label: t('flowComponents.knowledgeThreshold'),
          type: 'number',
          placeholder: '0.3',
          description: t('flowComponents.knowledgeThresholdDesc')
        },
        {
          key: 'outputVariable',
          label: t('flowComponents.knowledgeOutputVar'),
          type: 'text',
          placeholder: 'knowledge_context',
          description: t('flowComponents.knowledgeOutputVarDesc')
        }
      ];

    case 'JSCodeNode':
      return [
        {
          key: 'codeUnit',
          label: t('flowComponents.jsCode'),
          type: 'jsExpression',
          placeholder: t('flowComponents.enterJSCode'),
          description: t('flowComponents.jsCodeDesc')
        }
      ];

    case 'HttpNode':
      return [
        {
          key: 'method',
          label: 'HTTP Method',
          type: 'httpMethod',
          options: [
            { label: 'GET', value: 'GET' },
            { label: 'POST', value: 'POST' }
          ],
          description: '仅支持 GET / POST'
        },
        {
          key: 'url',
          label: 'URL',
          type: 'fullTextMiniExpression',
          placeholder: 'https://api.example.com',
          description: '使用表达式模式，推荐直接填写字符串或变量'
        },
        {
          key: 'headers',
          label: 'Headers',
          type: 'textInput',
          placeholder: 'Content-Type: application/json\nX-Request-Id: {{sys.RequestId}}',
          description: '使用 FullText 模式，每行一个键值对'
        },
        {
          key: 'query',
          label: 'Query',
          type: 'textInput',
          placeholder: '?name=abc&age=18',
          description: '使用 FullText 模式，示例：?name=abc'
        },
        {
          key: 'body',
          label: 'Body',
          type: 'textInput',
          placeholder: '请求体，支持变量 {{var}}',
          description: '使用富文本表达式，便于多行/模板输入'
        },
        {
          key: 'timeoutSeconds',
          label: 'Timeout (秒)',
          type: 'number',
          placeholder: '默认 5',
          description: '请求超时时间，单位秒'
        }
      ];

    default:
      return [];
  }
});

const isOutputEditable = computed(() => {
  if (!flowStore.selectedNode) return false;
  return flowStore.selectedNode.type === 'JSCodeNode';
});

const updateProperty = (key: string, value: any) => {
  editableProperties.value[key] = value;
};

interface ParsedCurlResult {
  method?: string;
  url?: string;
  headers?: string;
  query?: string;
  body?: string;
}

const handleHttpCurlImport = (parsed: ParsedCurlResult) => {
  if (!parsed) return;
  if (parsed.method) editableProperties.value.method = parsed.method.toUpperCase();
  if (parsed.url !== undefined) editableProperties.value.url = ExpressionUnitFactory.createFullTextMiniExpression(parsed.url);
  if (parsed.headers !== undefined) editableProperties.value.headers = ExpressionUnitFactory.createFullTextExpression(parsed.headers);
  if (parsed.query !== undefined) editableProperties.value.query = ExpressionUnitFactory.createFullTextExpression(parsed.query);
  if (parsed.body !== undefined) editableProperties.value.body = ExpressionUnitFactory.createFullTextExpression(parsed.body);
};

const handleFieldImportCurl = (field: PropertyFieldConfig, parsed: ParsedCurlResult) => {
  if (field.key === 'method') handleHttpCurlImport(parsed);
};

const handleClose = () => emit('update:visible', false);

const handleSave = () => {
  if (!flowStore.selectedNode) return;
  const propertiesToSave = { ...editableProperties.value };
  if (flowStore.selectedNode.type === 'LLMNode' && propertiesToSave.memoryConfig) {
    propertiesToSave.memoryEnabled = propertiesToSave.memoryConfig.enabled;
    propertiesToSave.memoryRounds = propertiesToSave.memoryConfig.rounds;
    delete propertiesToSave.memoryConfig;
  }
  emit('save', flowStore.selectedNode.id, propertiesToSave);
  handleClose();
};
</script>

<style scoped>
/* ── Transition ── */
.cfg-slide-enter-active,
.cfg-slide-leave-active {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.2s ease;
}
.cfg-slide-enter-from,
.cfg-slide-leave-to {
  transform: translateX(24px);
  opacity: 0;
}

/* ── Panel shell ── */
.cfg-panel {
  position: fixed;
  top: 68px;
  right: 12px;
  bottom: 12px;
  width: 400px;
  max-width: calc(100vw - 24px);
  z-index: 900;
  display: flex;
  flex-direction: column;
  background: var(--nf-bg-base);
  border: 1px solid var(--nf-border);
  border-radius: 14px;
  box-shadow: var(--nf-shadow-lg);
  overscroll-behavior: contain;
}

/* ── Header ── */
.cfg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--nf-border);
  flex-shrink: 0;
}

.cfg-header-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.cfg-node-icon {
  color: var(--nf-text-secondary);
  flex-shrink: 0;
}

.cfg-header-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.cfg-node-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--nf-text-primary);
  white-space: nowrap;
}

.cfg-node-type {
  font-size: 11px;
  color: var(--nf-text-muted);
  font-family: 'SF Mono', 'Fira Code', monospace;
  white-space: nowrap;
}

.cfg-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--nf-text-muted);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
}

.cfg-close:hover {
  background: var(--nf-bg-muted);
  color: var(--nf-text-primary);
}

.cfg-close:focus-visible {
  outline: 2px solid var(--nf-accent);
  outline-offset: 2px;
}

/* ── Body ── */
.cfg-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  overscroll-behavior: contain;
}

.cfg-body::-webkit-scrollbar {
  width: 4px;
}
.cfg-body::-webkit-scrollbar-track {
  background: transparent;
}
.cfg-body::-webkit-scrollbar-thumb {
  background: var(--nf-scrollbar);
  border-radius: 2px;
}
.cfg-body::-webkit-scrollbar-thumb:hover {
  background: var(--nf-scrollbar-hover);
}

/* ── Sections ── */
.cfg-section {
  margin-bottom: 18px;
}
.cfg-section:last-child {
  margin-bottom: 4px;
}

.cfg-section-label {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--nf-text-primary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--nf-border);
}

/* ── Form field overrides ── */
.cfg-form {
  :deep(.property-field) {
    display: flex;
    flex-direction: column;
    margin-bottom: 14px;
    gap: 5px;
  }

  :deep(.property-field:last-child) {
    margin-bottom: 6px;
  }

  :deep(.property-field .field-label) {
    font-size: 12px;
    font-weight: 500;
    color: var(--nf-text-secondary);
    line-height: 1.3;
  }

  :deep(.property-field .field-content) {
    flex: 1;
    min-width: 0;
  }

  :deep(.property-field .el-input),
  :deep(.property-field .el-input-number),
  :deep(.property-field .el-select) {
    width: 100% !important;
  }

  :deep(.property-field .el-input__inner),
  :deep(.property-field .el-input-number__inner) {
    font-size: 13px;
  }

  :deep(.property-field .el-textarea) {
    width: 100% !important;
  }

  :deep(.property-field .el-textarea__inner) {
    min-height: 52px;
    font-size: 13px;
  }

  :deep(.property-field .field-description) {
    margin-top: 3px;
    font-size: 11px;
    color: var(--nf-text-muted);
    line-height: 1.4;
  }

  :deep(.property-field .el-switch) {
    margin-top: 2px;
  }
}

/* ── Empty ── */
.cfg-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}

/* ── Footer ── */
.cfg-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--nf-border);
  flex-shrink: 0;
}

.cfg-btn {
  border: none;
  border-radius: 8px;
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.cfg-btn:focus-visible {
  outline: 2px solid var(--nf-accent);
  outline-offset: 2px;
}

.cfg-btn-ghost {
  background: transparent;
  color: var(--nf-text-secondary);
}
.cfg-btn-ghost:hover {
  background: var(--nf-bg-muted);
  color: var(--nf-text-primary);
}

.cfg-btn-solid {
  background: var(--nf-accent);
  color: #fff;
}
.cfg-btn-solid:hover {
  background: var(--nf-accent-hover);
}
</style>

<style>
.input-dialog .el-dialog__header {
  background: var(--nf-bg-muted);
  color: var(--nf-text-primary);
}
.input-dialog .el-dialog__title { color: var(--nf-text-primary); }
.session-dialog .el-dialog__header {
  background: var(--nf-bg-muted);
  color: var(--nf-text-primary);
}
.session-dialog .el-dialog__title { color: var(--nf-text-primary); }
.input-dialog.el-dialog,
.session-dialog.el-dialog {
  z-index: 2000 !important;
}
.el-overlay.is-message-box {
  z-index: 1999 !important;
}
</style>
