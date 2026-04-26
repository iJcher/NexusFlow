<template>
  <div class="widget-node knowledge-widget">
    <div class="widget-header">
      <el-icon :size="16" class="widget-icon"><Collection /></el-icon>
      <input
        v-model="displayName"
        class="widget-title-input"
        @blur="update('displayName', displayName || 'Knowledge')"
        @keydown.enter="($event.target as HTMLInputElement)?.blur()"
      />
    </div>
    <div class="widget-body" @mousedown.stop>
      <div class="widget-field">
        <label class="field-label">{{ t('flowComponents.knowledgeBaseSelect') }}</label>
        <el-select
          v-model="selectedKnowledgeBaseIds"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          size="small"
          :placeholder="t('flowComponents.knowledgeBaseSelectPlaceholder')"
          :teleported="false"
          class="knowledge-select"
          @change="commitKbIds"
        >
          <el-option
            v-for="kb in knowledgeBases"
            :key="kb.id"
            :label="`${kb.name} (${kb.chunkCount || 0} chunks)`"
            :value="kb.id"
            :disabled="!kb.chunkCount"
          />
        </el-select>
        <p class="field-hint">
          {{ knowledgeBases.length ? '默认优先选择已有文档切片的知识库。' : '暂无知识库：可先保存流程，或到 Knowledge 页面创建并上传文档。' }}
        </p>
      </div>
      <div class="widget-field">
        <div class="field-label-row">
          <label class="field-label">{{ t('flowComponents.knowledgeQuery') }}</label>
          <button class="variable-btn" @click.stop="variableSelectorVisible = true">
            {{ t('flowComponents.insertVariable') }}
          </button>
        </div>
        <el-input
          v-model="queryText"
          type="textarea"
          :rows="2"
          placeholder="默认使用用户问题"
          resize="vertical"
          size="small"
          @input="commitQuery"
        />
      </div>
      <div class="widget-field-row">
        <div class="widget-field mini">
          <label class="field-label">Top K</label>
          <el-input-number v-model="topK" :min="1" :max="20" size="small" @change="update('topK', topK)" />
        </div>
        <div class="widget-field mini">
          <label class="field-label">{{ t('flowComponents.knowledgeThreshold') }}</label>
          <el-input-number v-model="threshold" :min="0" :max="1" :step="0.05" :precision="2" size="small" @change="update('threshold', threshold)" />
        </div>
      </div>
    </div>
    <VariableSelector
      v-model:visible="variableSelectorVisible"
      :current-node-id="nodeId"
      @select="handleVariableSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, inject, onMounted, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Collection } from '@element-plus/icons-vue'
import { KnowledgeService, type IKnowledgeBaseDto } from '@/services/knowledge.service'
import type { VariableItem } from '@/types/flow-designer/variableSelector.types'
import VariableSelector from '../components/VariableSelector.vue'

const { t } = useI18n()
const nodeData = inject<Ref<Record<string, any>>>('nodeData')!
const nodeId = inject<string>('nodeId')
const onUpdate = inject<(patch: Record<string, any>) => void>('onUpdate')!

const displayName = ref(nodeData.value.displayName || 'Knowledge')
const knowledgeBases = ref<IKnowledgeBaseDto[]>([])
const selectedKnowledgeBaseIds = ref<string[]>((nodeData.value.knowledgeBaseIds || []).map(String))
const queryText = ref(nodeData.value.queryExpression?.text || nodeData.value.queryExpression?.Text || '{{sys.query}}')
const topK = ref(nodeData.value.topK ?? 5)
const threshold = ref(nodeData.value.threshold ?? 0.1)
const variableSelectorVisible = ref(false)

const update = (key: string, value: any) => onUpdate({ [key]: value })

const commitKbIds = () => {
  update('knowledgeBaseIds', selectedKnowledgeBaseIds.value)
}

const commitQuery = () => {
  update('queryExpression', { typeName: 'FullTextExpressionUnit', text: queryText.value, Text: queryText.value })
}

const handleVariableSelect = (variable: VariableItem) => {
  queryText.value += `{{${variable.key}}}`
  commitQuery()
}

const loadKnowledgeBases = async () => {
  try {
    const response = await KnowledgeService.getList({ pageSize: 100 })
    if (response.errCode !== 0 || !response.data) return

    knowledgeBases.value = response.data.items
    if (selectedKnowledgeBaseIds.value.length > 0) return

    const firstReadyKb = knowledgeBases.value.find(kb => kb.chunkCount > 0)
    if (!firstReadyKb) return

    selectedKnowledgeBaseIds.value = [firstReadyKb.id]
    commitKbIds()
  } catch (error) {
    console.error('Failed to load knowledge bases:', error)
  }
}

onMounted(loadKnowledgeBases)
</script>

<style scoped>
.knowledge-widget {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.widget-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.widget-icon { color: var(--nf-text-secondary, #71717a); flex-shrink: 0; }

.widget-title-input {
  flex: 1; min-width: 0; border: none; outline: none;
  background: transparent; font-size: 12px; font-weight: 600;
  color: var(--nf-text-primary, #fafafa); padding: 2px 4px; border-radius: 4px;
}
.widget-title-input:focus { background: var(--nf-bg-elevated, #27272a); }

.widget-body { display: flex; flex-direction: column; gap: 6px; }

.widget-field { display: flex; flex-direction: column; gap: 3px; }

.widget-field-row { display: flex; gap: 8px; }

.widget-field.mini { flex: 1; }

.field-label {
  font-size: 12px; font-weight: 500;
  color: var(--nf-text-secondary, #a1a1aa); line-height: 1.3;
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.variable-btn {
  border: 1px solid rgba(0, 255, 159, 0.25);
  border-radius: 4px;
  background: transparent;
  color: var(--nf-accent, #00FF9F);
  font-size: 12px;
  line-height: 1.4;
  padding: 1px 6px;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
}

.variable-btn:hover {
  border-color: rgba(0, 255, 159, 0.45);
  color: var(--nf-accent-hover, #33FFB3);
  background: rgba(0, 255, 159, 0.06);
}

.field-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--nf-text-body, #8B9DB0);
}

.knowledge-select {
  width: 100%;
}

:deep(.el-textarea__inner) { font-size: 12px; min-height: 36px !important; padding: 4px 7px; }
:deep(.el-input-number) { width: 100%; }
</style>
