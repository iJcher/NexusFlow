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
        <el-input
          v-model="kbIdsText"
          size="small"
          :placeholder="t('flowComponents.knowledgeBaseSelectPlaceholder')"
          @change="commitKbIds"
        />
      </div>
      <div class="widget-field">
        <label class="field-label">{{ t('flowComponents.knowledgeQuery') }}</label>
        <el-input
          v-model="queryText"
          type="textarea"
          :rows="2"
          placeholder="{{sys.query}}"
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
  </div>
</template>

<script setup lang="ts">
import { ref, inject, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Collection } from '@element-plus/icons-vue'

const { t } = useI18n()
const nodeData = inject<Ref<Record<string, any>>>('nodeData')!
const onUpdate = inject<(patch: Record<string, any>) => void>('onUpdate')!

const displayName = ref(nodeData.value.displayName || 'Knowledge')
const kbIdsText = ref((nodeData.value.knowledgeBaseIds || []).join(', '))
const queryText = ref(nodeData.value.queryExpression?.text || nodeData.value.queryExpression?.Text || '{{sys.query}}')
const topK = ref(nodeData.value.topK ?? 5)
const threshold = ref(nodeData.value.threshold ?? 0.3)

const update = (key: string, value: any) => onUpdate({ [key]: value })

const commitKbIds = () => {
  const ids = kbIdsText.value.split(/[,，\s]+/).filter(Boolean)
  update('knowledgeBaseIds', ids)
}

const commitQuery = () => {
  update('queryExpression', { typeName: 'FullTextExpressionUnit', text: queryText.value, Text: queryText.value })
}
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
  font-size: 11px; font-weight: 500;
  color: var(--nf-text-secondary, #a1a1aa); line-height: 1.3;
}

:deep(.el-textarea__inner) { font-size: 11px; min-height: 36px !important; padding: 4px 7px; }
:deep(.el-input-number) { width: 100%; }
</style>
