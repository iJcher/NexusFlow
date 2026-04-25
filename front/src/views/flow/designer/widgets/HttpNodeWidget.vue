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
            <el-option label="PUT" value="PUT" />
            <el-option label="PATCH" value="PATCH" />
            <el-option label="DELETE" value="DELETE" />
          </el-select>
          <el-input
            v-model="urlText"
            size="small"
            placeholder="https://api.example.com"
            class="url-input"
            @input="commitUrl"
          />
          <button class="variable-btn variable-btn--compact" @click.stop="openVariableSelector({ kind: 'url' })">
            {{ t('flowComponents.insertVariable') }}
          </button>
        </div>

        <div class="widget-field">
          <div class="field-label-row">
            <label class="field-label">{{ t('flowComponents.httpQueryParams') }}</label>
            <button class="variable-btn" @click.stop="addQueryParam">
              {{ t('flowComponents.httpAddParam') }}
            </button>
          </div>
          <div class="kv-list">
            <div v-for="item in queryParams" :key="item.id" class="kv-row">
              <el-input v-model="item.key" size="small" :placeholder="t('flowComponents.httpKey')" @input="commitQueryParams" />
              <el-input v-model="item.value" size="small" :placeholder="t('flowComponents.httpValue')" @input="commitQueryParams" />
              <button class="mini-icon-btn" @click.stop="openVariableSelector({ kind: 'query', id: item.id })">{x}</button>
              <button class="mini-icon-btn danger" @click.stop="removeQueryParam(item.id)">×</button>
            </div>
            <p v-if="queryParams.length === 0" class="empty-hint">{{ t('flowComponents.httpNoParams') }}</p>
          </div>
        </div>

        <div class="widget-field">
          <div class="field-label-row">
            <label class="field-label">{{ t('flowComponents.httpHeaders') }}</label>
            <button class="variable-btn" @click.stop="addHeaderParam">
              {{ t('flowComponents.httpAddHeader') }}
            </button>
          </div>
          <div class="kv-list">
            <div v-for="item in headerParams" :key="item.id" class="kv-row">
              <el-input v-model="item.key" size="small" placeholder="Content-Type" @input="commitHeaderParams" />
              <el-input v-model="item.value" size="small" placeholder="application/json" @input="commitHeaderParams" />
              <button class="mini-icon-btn" @click.stop="openVariableSelector({ kind: 'header', id: item.id })">{x}</button>
              <button class="mini-icon-btn danger" @click.stop="removeHeaderParam(item.id)">×</button>
            </div>
            <p v-if="headerParams.length === 0" class="empty-hint">{{ t('flowComponents.httpNoHeaders') }}</p>
          </div>
        </div>

        <div class="widget-field">
          <div class="field-label-row">
            <label class="field-label">{{ t('flowComponents.httpBody') }}</label>
            <div class="inline-actions">
              <el-select v-model="bodyMode" size="small" class="body-mode-select" @change="handleBodyModeChange">
                <el-option :label="t('flowComponents.httpBodyNone')" value="none" />
                <el-option label="JSON" value="json" />
                <el-option label="RAW" value="raw" />
              </el-select>
              <button
                v-if="bodyMode !== 'none'"
                class="variable-btn"
                @click.stop="openVariableSelector({ kind: 'body' })"
              >
                {{ t('flowComponents.insertVariable') }}
              </button>
            </div>
          </div>
          <el-input
            v-if="bodyMode !== 'none'"
            v-model="bodyText"
            type="textarea"
            :rows="3"
            :placeholder="bodyPlaceholder"
            size="small"
            resize="vertical"
            @input="commitField('body', bodyText)"
          />
        </div>

        <div class="widget-field">
          <label class="field-label">{{ t('flowComponents.httpTimeout') }}</label>
          <el-input-number
            v-model="timeout"
            :min="1"
            :max="120"
            size="small"
            controls-position="right"
            @change="update('timeoutSeconds', $event)"
          />
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

interface HttpKeyValueItem {
  id: string
  enabled: boolean
  key: string
  value: string
}

interface PersistedHttpKeyValueItem {
  id?: string
  enabled?: boolean
  key?: string
  value?: string
}

type VariableTarget =
  | { kind: 'url' }
  | { kind: 'body' }
  | { kind: 'query'; id: string }
  | { kind: 'header'; id: string }

const { t } = useI18n()
const nodeData = inject<Ref<Record<string, unknown>>>('nodeData')!
const nodeId = inject<string>('nodeId')
const onUpdate = inject<(patch: Record<string, unknown>) => void>('onUpdate')!

const collapsed = ref<boolean>(false)
const displayName = ref<string>(String(nodeData.value.displayName || 'HTTP'))
const method = ref<string>(String(nodeData.value.method || 'GET'))
const timeout = ref<number>(Number(nodeData.value.timeoutSeconds ?? 5))
const bodyMode = ref<'none' | 'json' | 'raw'>((nodeData.value.bodyMode as 'none' | 'json' | 'raw') || 'none')

const extractText = (unit: AnyExpressionUnit | string | unknown): string => {
  if (!unit) return ''
  if (typeof unit === 'string') return unit
  const field = unit as { typeName?: string; Text?: string; text?: string }
  if (field.typeName === 'FullTextMiniExpressionUnit') return field.Text || field.text || ''
  if (field.typeName === 'FullTextExpressionUnit') return field.Text || field.text || ''
  return ''
}

const normalizeItems = (items: unknown): HttpKeyValueItem[] => {
  if (!Array.isArray(items)) return []
  return items.map((item: PersistedHttpKeyValueItem) => ({
    id: item.id || generateId('http_item'),
    enabled: item.enabled !== false,
    key: item.key || '',
    value: item.value || '',
  }))
}

const urlText = ref<string>(extractText(nodeData.value.url))
const bodyText = ref<string>(extractText(nodeData.value.body))
const queryParams = ref<HttpKeyValueItem[]>(normalizeItems(nodeData.value.queryParams))
const headerParams = ref<HttpKeyValueItem[]>(normalizeItems(nodeData.value.headerParams))
const variableSelectorVisible = ref<boolean>(false)
const variableTarget = ref<VariableTarget>({ kind: 'body' })

const urlPreview = computed<string>(() => {
  const value = urlText.value.trim()
  return value.length > 35 ? `${value.substring(0, 35)}...` : (value || 'Set URL')
})

const bodyPlaceholder = computed<string>(() =>
  bodyMode.value === 'json' ? '{\n  "query": "{{sys.query}}"\n}' : 'Request body',
)

const update = (key: string, value: unknown) => onUpdate({ [key]: value })

const commitUrl = () => {
  const existing = nodeData.value.url as FullTextMiniExpressionUnit | undefined
  if (existing && existing.typeName === 'FullTextMiniExpressionUnit') {
    update('url', { ...existing, Text: urlText.value })
  }
  else {
    update('url', ExpressionUnitFactory.createFullTextMiniExpression(urlText.value))
  }
}

const commitField = (key: string, text: string) => {
  const existing = nodeData.value[key] as AnyExpressionUnit | undefined
  if (existing && (existing.typeName === 'FullTextExpressionUnit' || existing.typeName === 'FullTextMiniExpressionUnit')) {
    update(key, { ...existing, Text: text })
  }
  else {
    update(key, ExpressionUnitFactory.createFullTextExpression(text))
  }
}

const generateId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

const persistItem = (item: HttpKeyValueItem): PersistedHttpKeyValueItem => ({
  id: item.id,
  enabled: item.enabled,
  key: item.key,
  value: item.value,
})

const addQueryParam = () => {
  queryParams.value.push({ id: generateId('query'), enabled: true, key: '', value: '' })
  commitQueryParams()
}

const removeQueryParam = (id: string) => {
  queryParams.value = queryParams.value.filter(item => item.id !== id)
  commitQueryParams()
}

const commitQueryParams = () => {
  update('queryParams', queryParams.value.map(persistItem))
}

const addHeaderParam = () => {
  headerParams.value.push({ id: generateId('header'), enabled: true, key: '', value: '' })
  commitHeaderParams()
}

const removeHeaderParam = (id: string) => {
  headerParams.value = headerParams.value.filter(item => item.id !== id)
  commitHeaderParams()
}

const commitHeaderParams = () => {
  update('headerParams', headerParams.value.map(persistItem))
}

const handleBodyModeChange = (value: string | number | boolean | undefined) => {
  update('bodyMode', value)
}

const openVariableSelector = (target: VariableTarget) => {
  variableTarget.value = target
  variableSelectorVisible.value = true
}

const handleVariableSelect = (variable: VariableItem) => {
  const placeholder = `{{${variable.key}}}`

  if (variableTarget.value.kind === 'url') {
    urlText.value += placeholder
    commitUrl()
    return
  }

  const target = variableTarget.value

  if (target.kind === 'query') {
    const item = queryParams.value.find(row => row.id === target.id)
    if (item) {
      item.value += placeholder
      commitQueryParams()
    }
    return
  }

  if (target.kind === 'header') {
    const item = headerParams.value.find(row => row.id === target.id)
    if (item) {
      item.value += placeholder
      commitHeaderParams()
    }
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
  font-family: var(--nf-font-display);
  overflow-y: auto;
}

.widget-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.widget-icon {
  color: var(--nf-text-secondary, #71717a);
  flex-shrink: 0;
}

.widget-title-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: var(--nf-text-primary, #fafafa);
  padding: 2px 4px;
  border-radius: 4px;
}

.widget-title-input:focus {
  background: var(--nf-bg-elevated, #27272a);
}

.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--nf-text-muted, #a1a1aa);
  cursor: pointer;
}

.toggle-btn:hover {
  background: var(--nf-bg-elevated, #27272a);
  color: var(--nf-text-primary, #fafafa);
}

.widget-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.method-url-row,
.kv-row,
.inline-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.method-select {
  width: 84px;
  flex-shrink: 0;
}

.url-input {
  flex: 1;
}

.widget-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--nf-text-secondary, #a1a1aa);
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.body-mode-select {
  width: 88px;
}

.kv-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kv-row :deep(.el-input) {
  min-width: 0;
}

.variable-btn,
.mini-icon-btn {
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

.mini-icon-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  flex-shrink: 0;
  font-family: var(--nf-font-mono);
}

.mini-icon-btn.danger {
  border-color: rgba(248, 113, 113, 0.35);
  color: var(--nf-danger, #f87171);
}

.variable-btn:hover,
.mini-icon-btn:hover {
  border-color: rgba(0, 255, 159, 0.45);
  color: var(--nf-accent-hover, #33FFB3);
  background: rgba(0, 255, 159, 0.06);
}

.mini-icon-btn.danger:hover {
  border-color: #fca5a5;
  color: #fca5a5;
  background: rgba(248, 113, 113, 0.06);
}

.empty-hint {
  margin: 0;
  color: var(--nf-text-body, #8B9DB0);
  font-size: 12px;
  line-height: 1.5;
}

.collapsed-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

.method-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--nf-accent-muted, rgba(0, 212, 170, 0.15));
  color: var(--nf-accent, #00d4aa);
}

.summary-text {
  font-size: 12px;
  color: var(--nf-text-body, #8B9DB0);
}

:deep(.el-textarea__inner) {
  font-size: 12px;
  padding: 4px 7px;
}

:deep(.el-input__inner) {
  font-size: 12px;
}
</style>
