<template>
  <div class="widget-node llm-widget">
    <div class="widget-header">
      <el-icon :size="16" class="widget-icon"><MagicStick /></el-icon>
      <input
        v-model="displayName"
        class="widget-title-input"
        @mousedown.stop
        @blur="commitName"
        @keydown.enter="($event.target as HTMLInputElement)?.blur()"
      />
      <button class="toggle-btn" @click.stop="collapsed = !collapsed" @mousedown.stop>
        <el-icon :size="14"><ArrowUp v-if="!collapsed" /><ArrowDown v-else /></el-icon>
      </button>
    </div>

    <template v-if="!collapsed">
      <div class="widget-field">
        <label class="field-label">{{ t('flowComponents.modelSelection') }}</label>
        <el-select
          v-model="modelSelection"
          :placeholder="t('flowComponents.selectLLMModel')"
          size="small"
          filterable
          :teleported="false"
          style="width: 100%"
          popper-class="nf-node-select-popper"
          @change="update('modelSelection', $event)"
        >
          <el-option-group
            v-for="provider in modelProviders"
            :key="provider.id"
            :label="provider.platformName"
          >
            <el-option
              v-for="name in provider.llmNames"
              :key="`${provider.platformName}|${name}`"
              :label="name"
              :value="`${provider.platformName}|${name}`"
            />
          </el-option-group>
        </el-select>
      </div>

      <div class="widget-field">
        <label class="field-label">{{ t('flowComponents.temperature') }}</label>
        <div class="slider-row">
          <el-slider v-model="temperature" :min="0" :max="1" :step="0.1" size="small" class="flex-1" @change="update('temperature', $event)" />
          <span class="slider-val">{{ temperature }}</span>
        </div>
      </div>

      <div class="widget-field">
        <label class="field-label">{{ t('flowComponents.systemPrompt') }}</label>
        <el-input
          v-model="systemPromptText"
          type="textarea"
          :rows="3"
          :placeholder="t('flowComponents.enterSystemPrompt')"
          resize="vertical"
          size="small"
          @input="commitPrompt('systemPrompt', $event)"
        />
      </div>

      <div class="widget-field">
        <label class="field-label">{{ t('flowComponents.userPrompt') }}</label>
        <el-input
          v-model="userPromptText"
          type="textarea"
          :rows="3"
          :placeholder="t('flowComponents.enterUserPrompt')"
          resize="vertical"
          size="small"
          @input="commitPrompt('userPrompt', $event)"
        />
      </div>

      <div class="widget-row">
        <div class="widget-field flex-1">
          <label class="field-label">{{ t('flowComponents.memoryConfig') }}</label>
          <div class="inline-row">
            <el-switch v-model="memoryEnabled" size="small" @change="update('memoryEnabled', $event)" />
            <el-input-number
              v-if="memoryEnabled"
              v-model="memoryRounds"
              :min="1"
              :max="50"
              size="small"
              controls-position="right"
              class="rounds-input"
              @change="update('memoryRounds', $event)"
            />
          </div>
        </div>
        <div class="widget-field">
          <label class="field-label">{{ t('flowComponents.enableThinking') }}</label>
          <el-switch v-model="enableThinking" size="small" @change="update('enableThinking', $event)" />
        </div>
      </div>
    </template>

    <div v-else class="collapsed-summary">
      <span class="summary-text">{{ modelDisplayName }} · T={{ temperature }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MagicStick, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { LLMProviderService } from '@/services/llmProvider.service'
import type { IFlowLLMProviderDto } from '@/types/llmProvider.types'
import { ExpressionUnitFactory } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'
import type { AnyExpressionUnit } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'

const { t } = useI18n()

const nodeData = inject<Ref<Record<string, any>>>('nodeData')!
const onUpdate = inject<(patch: Record<string, any>) => void>('onUpdate')!

const collapsed = ref(false)
const modelProviders = ref<IFlowLLMProviderDto[]>([])

const displayName = ref(nodeData.value.displayName || 'LLM')
const modelSelection = ref(nodeData.value.modelSelection || '')
const temperature = ref(nodeData.value.temperature ?? 0.7)
const memoryEnabled = ref(nodeData.value.memoryEnabled ?? false)
const memoryRounds = ref(nodeData.value.memoryRounds ?? 5)
const enableThinking = ref(nodeData.value.enableThinking ?? false)

const extractText = (unit: AnyExpressionUnit | string | undefined): string => {
  if (!unit) return ''
  if (typeof unit === 'string') return unit
  if (unit.typeName === 'FullTextExpressionUnit') return (unit as any).Text || ''
  if (unit.typeName === 'JSExpressionUnit') {
    const js = unit as any
    return js.isFunctionMode ? js.functionCode : js.expressionCode
  }
  return ''
}

const systemPromptText = ref(extractText(nodeData.value.systemPrompt))
const userPromptText = ref(extractText(nodeData.value.userPrompt))

const modelDisplayName = computed(() => {
  if (!modelSelection.value) return 'No model'
  const parts = modelSelection.value.split('|')
  return parts.length === 2 ? parts[1] : modelSelection.value
})

const getFirstAvailableModel = (providers: IFlowLLMProviderDto[]): string => {
  for (const provider of providers) {
    const platformName = provider.platformName
    const firstModelName = provider.llmNames?.[0]
    if (platformName && firstModelName) {
      return `${platformName}|${firstModelName}`
    }
  }
  return ''
}

const update = (key: string, value: any) => {
  onUpdate({ [key]: value })
}

const commitName = () => {
  update('displayName', displayName.value || 'LLM')
}

const commitPrompt = (key: string, text: string) => {
  const existing = nodeData.value[key] as AnyExpressionUnit | undefined
  if (existing && existing.typeName === 'FullTextExpressionUnit') {
    update(key, { ...existing, Text: text })
  } else {
    update(key, ExpressionUnitFactory.createFullTextExpression(text))
  }
}

const loadModelProviders = async () => {
  try {
    const response = await LLMProviderService.getProviderList()
    if (response.errCode === 0 && response.data) {
      modelProviders.value = response.data
      if (!modelSelection.value) {
        const firstModel = getFirstAvailableModel(response.data)
        if (firstModel) {
          modelSelection.value = firstModel
          update('modelSelection', firstModel)
        }
      }
    }
  } catch (e) {
    console.error('Failed to load model providers:', e)
  }
}

onMounted(loadModelProviders)
</script>

<style scoped>
.llm-widget {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow-y: auto;
  overflow-x: hidden;
}

.llm-widget::-webkit-scrollbar { width: 3px; }
.llm-widget::-webkit-scrollbar-thumb { background: var(--nf-scrollbar, #52525b); border-radius: 2px; }

.widget-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.widget-icon { color: var(--nf-text-secondary, #71717a); flex-shrink: 0; }

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
  transition: background 0.15s;
}
.widget-title-input:focus {
  background: var(--nf-bg-elevated, #27272a);
}

.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--nf-text-muted, #a1a1aa);
  cursor: pointer;
  flex-shrink: 0;
}
.toggle-btn:hover {
  background: var(--nf-bg-elevated, #27272a);
  color: var(--nf-text-primary, #fafafa);
}

.widget-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.field-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--nf-text-secondary, #a1a1aa);
  line-height: 1.3;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.slider-val {
  font-size: 10px;
  color: var(--nf-text-muted, #71717a);
  font-variant-numeric: tabular-nums;
  min-width: 20px;
  text-align: right;
}

.widget-row {
  display: flex;
  gap: 12px;
}

.inline-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rounds-input {
  width: 90px;
}

.flex-1 { flex: 1; min-width: 0; }

.collapsed-summary {
  padding: 2px 0;
}
.summary-text {
  font-size: 11px;
  color: var(--nf-text-muted, #a1a1aa);
}

:deep(.el-textarea__inner) {
  font-size: 11px;
  min-height: 36px !important;
  padding: 4px 7px;
}
:deep(.el-input__inner) {
  font-size: 11px;
  height: 24px;
  line-height: 24px;
}
:deep(.el-select) {
  --el-select-input-font-size: 11px;
}
:deep(.el-select__wrapper) {
  min-height: 24px;
  padding: 0 6px;
  font-size: 11px;
}
:deep(.el-select__placeholder) {
  font-size: 11px;
}
:deep(.el-select__suffix) {
  font-size: 10px;
}
:deep(.el-input--small .el-input__wrapper) {
  padding: 0 6px;
}
</style>

<style>
.nf-node-select-popper {
  --el-font-size-base: 11px;
}
.nf-node-select-popper .el-select-dropdown__item {
  font-size: 11px;
  height: 26px;
  line-height: 26px;
  padding: 0 10px;
}
.nf-node-select-popper .el-select-group__title {
  font-size: 10px;
  padding-left: 10px;
  line-height: 22px;
}
.nf-node-select-popper .el-select-group__wrap::after {
  display: none;
}
.nf-node-select-popper .el-scrollbar {
  max-height: 180px;
}
.nf-node-select-popper .el-select-dropdown__list {
  padding: 2px 0;
}
</style>
