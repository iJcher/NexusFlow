<template>
  <div class="widget-node http-widget">
    <div class="widget-header">
      <el-icon :size="16" class="widget-icon"><Link /></el-icon>
      <input
        v-model="displayName"
        class="widget-title-input"
        @blur="update('displayName', displayName || 'HTTP')"
        @keydown.enter="($event.target as HTMLInputElement)?.blur()"
      />
      <button class="toggle-btn" @click="collapsed = !collapsed">
        <el-icon :size="14"><ArrowUp v-if="!collapsed" /><ArrowDown v-else /></el-icon>
      </button>
    </div>

    <template v-if="!collapsed">
      <div class="widget-body" @mousedown.stop>
        <div class="method-url-row">
          <el-select v-model="method" size="small" class="method-select" @change="update('method', $event)">
            <el-option label="GET" value="GET" />
            <el-option label="POST" value="POST" />
          </el-select>
          <el-input
            v-model="urlText"
            size="small"
            placeholder="https://api.example.com"
            class="url-input"
            @input="commitUrl"
          />
          <button class="variable-btn variable-btn--compact" @click.stop="openVariableSelector('url')">
            {{ t('flowComponents.insertVariable') }}
          </button>
        </div>

        <div class="widget-field">
          <div class="field-label-row">
            <label class="field-label">Headers</label>
            <button class="variable-btn" @click.stop="openVariableSelector('headers')">
              {{ t('flowComponents.insertVariable') }}
            </button>
          </div>
          <el-input
            v-model="headersText"
            type="textarea"
            :rows="2"
            placeholder="Content-Type: application/json"
            size="small"
            resize="vertical"
            @input="commitField('headers', headersText)"
          />
        </div>

        <div class="widget-field">
          <div class="field-label-row">
            <label class="field-label">Body</label>
            <button class="variable-btn" @click.stop="openVariableSelector('body')">
              {{ t('flowComponents.insertVariable') }}
            </button>
          </div>
          <el-input
            v-model="bodyText"
            type="textarea"
            :rows="2"
            placeholder="Request body"
            size="small"
            resize="vertical"
            @input="commitField('body', bodyText)"
          />
        </div>

        <div class="widget-field">
          <label class="field-label">Timeout (s)</label>
          <el-input-number v-model="timeout" :min="1" :max="120" size="small" controls-position="right" @change="update('timeoutSeconds', $event)" />
        </div>
      </div>
    </template>
    <div v-else class="collapsed-summary">
      <span class="method-badge">{{ method }}</span>
      <span class="summary-text">{{ urlPreview }}</span>
    </div>
    <VariableSelector
      v-model:visible="variableSelectorVisible"
      :current-node-id="nodeId"
      @select="handleVariableSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Link, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { ExpressionUnitFactory } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'
import type { AnyExpressionUnit, FullTextMiniExpressionUnit } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'
import type { VariableItem } from '@/types/flow-designer/variableSelector.types'
import VariableSelector from '../components/VariableSelector.vue'

const { t } = useI18n()
const nodeData = inject<Ref<Record<string, any>>>('nodeData')!
const nodeId = inject<string>('nodeId')
const onUpdate = inject<(patch: Record<string, any>) => void>('onUpdate')!

const collapsed = ref(false)
const displayName = ref(nodeData.value.displayName || 'HTTP')
const method = ref(nodeData.value.method || 'GET')
const timeout = ref(nodeData.value.timeoutSeconds ?? 5)

const extractText = (unit: AnyExpressionUnit | string | undefined): string => {
  if (!unit) return ''
  if (typeof unit === 'string') return unit
  if (unit.typeName === 'FullTextMiniExpressionUnit') return (unit as any).Text || ''
  if (unit.typeName === 'FullTextExpressionUnit') return (unit as any).Text || ''
  return ''
}

const urlText = ref(extractText(nodeData.value.url))
const headersText = ref(extractText(nodeData.value.headers))
const bodyText = ref(extractText(nodeData.value.body))
const variableSelectorVisible = ref(false)
const variableTarget = ref<'url' | 'headers' | 'body'>('body')

const urlPreview = computed(() => {
  const u = urlText.value.trim()
  return u.length > 35 ? u.substring(0, 35) + '...' : (u || 'Set URL')
})

const update = (key: string, value: any) => onUpdate({ [key]: value })

const commitUrl = () => {
  const existing = nodeData.value.url as FullTextMiniExpressionUnit | undefined
  if (existing && existing.typeName === 'FullTextMiniExpressionUnit') {
    update('url', { ...existing, Text: urlText.value })
  } else {
    update('url', ExpressionUnitFactory.createFullTextMiniExpression(urlText.value))
  }
}

const commitField = (key: string, text: string) => {
  const existing = nodeData.value[key] as AnyExpressionUnit | undefined
  if (existing && (existing.typeName === 'FullTextExpressionUnit' || existing.typeName === 'FullTextMiniExpressionUnit')) {
    update(key, { ...existing, Text: text })
  } else {
    update(key, ExpressionUnitFactory.createFullTextExpression(text))
  }
}

const openVariableSelector = (target: 'url' | 'headers' | 'body') => {
  variableTarget.value = target
  variableSelectorVisible.value = true
}

const handleVariableSelect = (variable: VariableItem) => {
  const placeholder = `{{${variable.key}}}`
  if (variableTarget.value === 'url') {
    urlText.value += placeholder
    commitUrl()
    return
  }
  if (variableTarget.value === 'headers') {
    headersText.value += placeholder
    commitField('headers', headersText.value)
    return
  }
  bodyText.value += placeholder
  commitField('body', bodyText.value)
}
</script>

<style scoped>
.http-widget {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow-y: auto;
}

.widget-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.widget-icon { color: var(--nf-text-secondary, #71717a); flex-shrink: 0; }

.widget-title-input {
  flex: 1; min-width: 0; border: none; outline: none;
  background: transparent; font-size: 12px; font-weight: 600;
  color: var(--nf-text-primary, #fafafa); padding: 2px 4px; border-radius: 4px;
}
.widget-title-input:focus { background: var(--nf-bg-elevated, #27272a); }

.toggle-btn {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border: none; border-radius: 4px;
  background: transparent; color: var(--nf-text-muted, #a1a1aa); cursor: pointer;
}
.toggle-btn:hover { background: var(--nf-bg-elevated, #27272a); color: var(--nf-text-primary, #fafafa); }

.widget-body { display: flex; flex-direction: column; gap: 5px; }

.method-url-row { display: flex; gap: 4px; }
.method-select { width: 72px; flex-shrink: 0; }
.url-input { flex: 1; }

.widget-field { display: flex; flex-direction: column; gap: 3px; }

.field-label {
  font-size: 11px; font-weight: 500;
  color: var(--nf-text-secondary, #a1a1aa);
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
  white-space: nowrap;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
}

.variable-btn--compact {
  height: 24px;
  align-self: center;
}

.variable-btn:hover {
  border-color: rgba(0, 255, 159, 0.45);
  color: var(--nf-accent-hover, #33FFB3);
  background: rgba(0, 255, 159, 0.06);
}

.collapsed-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}
.method-badge {
  font-size: 10px; font-weight: 700; padding: 1px 6px;
  border-radius: 3px;
  background: var(--nf-accent-muted, rgba(0,212,170,0.15));
  color: var(--nf-accent, #00d4aa);
}
.summary-text {
  font-size: 11px; color: var(--nf-text-muted, #a1a1aa);
}

:deep(.el-textarea__inner) { font-size: 11px; padding: 4px 7px; }
:deep(.el-input__inner) { font-size: 11px; }
</style>
