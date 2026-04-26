<template>
  <div class="widget-node condition-widget">
    <div class="widget-header">
      <el-icon :size="16" class="widget-icon"><Share /></el-icon>
      <input
        v-model="displayName"
        class="widget-title-input"
        @blur="update('displayName', displayName || 'Condition')"
        @keydown.enter="($event.target as HTMLInputElement)?.blur()"
      />
      <button class="add-btn" @click.stop="addCondition" title="Add condition">
        <el-icon :size="14"><Plus /></el-icon>
      </button>
    </div>

    <div class="widget-body" @mousedown.stop>
      <div
        v-for="(cond, idx) in conditions"
        :key="cond.id"
        class="condition-row"
      >
        <div class="cond-label">
          <span class="cond-index">{{ idx + 1 }}</span>
          <input
            v-model="cond.description"
            class="cond-desc-input"
            :placeholder="`Condition ${idx + 1}`"
            @input="commitConditions"
          />
          <el-select
            v-model="cond.mode"
            size="small"
            class="mode-select"
            @change="handleModeChange(idx)"
          >
            <el-option :label="t('flowComponents.conditionSimpleMode')" value="simple" />
            <el-option :label="t('flowComponents.conditionAdvancedMode')" value="advanced" />
          </el-select>
        </div>

        <div v-if="cond.mode !== 'advanced'" class="simple-rule">
          <button class="variable-select-btn" @click.stop="openVariableSelector(idx)">
            {{ cond.leftVariableKey || t('flowComponents.conditionSelectVariable') }}
          </button>
          <el-select
            v-model="cond.operator"
            size="small"
            class="operator-select"
            @change="commitSimpleCondition(idx)"
          >
            <el-option
              v-for="op in operatorOptions"
              :key="op.value"
              :label="op.label"
              :value="op.value"
            />
          </el-select>
          <el-input
            v-if="!isUnaryOperator(cond.operator)"
            v-model="cond.rightValue"
            size="small"
            :placeholder="t('flowComponents.conditionCompareValue')"
            @input="commitSimpleCondition(idx)"
          />
          <button v-if="conditions.length > 1" class="remove-btn" @click.stop="removeCondition(idx)">
            <el-icon :size="12"><Close /></el-icon>
          </button>
        </div>

        <div v-else class="cond-expr-row">
          <el-input
            v-model="conditionExprs[idx]"
            size="small"
            placeholder="e.g. {{sys.query}} === 'hello'"
            @input="commitConditionExpr(idx)"
          />
          <button class="variable-btn" @click.stop="openVariableSelector(idx)">
            {{ t('flowComponents.insertVariable') }}
          </button>
          <button v-if="conditions.length > 1" class="remove-btn" @click.stop="removeCondition(idx)">
            <el-icon :size="12"><Close /></el-icon>
          </button>
        </div>

        <div class="cond-anchor-dot" />
      </div>

      <div class="condition-row else-row">
        <div class="cond-label">
          <span class="cond-index else-badge">E</span>
          <span class="else-label">ELSE</span>
        </div>
        <div class="cond-anchor-dot" />
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
import { computed, ref, inject, type Ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Share, Plus, Close } from '@element-plus/icons-vue'
import { ExpressionUnitFactory } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'
import type { JSExpressionUnit } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'
import type { VariableItem } from '@/types/flow-designer/variableSelector.types'
import VariableSelector from '../components/VariableSelector.vue'

type ConditionMode = 'simple' | 'advanced'
type ConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'empty' | 'notEmpty'

interface ConditionRule {
  id: string
  expressionUnit: JSExpressionUnit
  description?: string
  lineId?: string
  mode?: ConditionMode
  leftVariableKey?: string
  operator?: ConditionOperator
  rightValue?: string
}

const { t } = useI18n()
const nodeData = inject<Ref<Record<string, unknown>>>('nodeData')!
const nodeId = inject<string>('nodeId')
const onUpdate = inject<(patch: Record<string, unknown>) => void>('onUpdate')!

const displayName = ref<string>(String(nodeData.value.displayName || 'Condition'))
const conditions = ref<ConditionRule[]>(normalizeConditions(nodeData.value.conditions))
const conditionExprs = ref<string[]>(conditions.value.map(c => extractExpr(c.expressionUnit)))
const variableSelectorVisible = ref<boolean>(false)
const variableTargetIndex = ref<number>(0)

const operatorOptions = computed<Array<{ value: ConditionOperator; label: string }>>(() => [
  { value: 'eq', label: t('flowComponents.conditionOpEq') },
  { value: 'neq', label: t('flowComponents.conditionOpNeq') },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'contains', label: t('flowComponents.conditionOpContains') },
  { value: 'notContains', label: t('flowComponents.conditionOpNotContains') },
  { value: 'startsWith', label: t('flowComponents.conditionOpStartsWith') },
  { value: 'endsWith', label: t('flowComponents.conditionOpEndsWith') },
  { value: 'empty', label: t('flowComponents.conditionOpEmpty') },
  { value: 'notEmpty', label: t('flowComponents.conditionOpNotEmpty') },
])

const update = (key: string, value: unknown) => onUpdate({ [key]: value })

function normalizeConditions(value: unknown): ConditionRule[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [createConditionRule(1)]
  }

  return value.map((item: Partial<ConditionRule>, index: number) => ({
    id: item.id || generateId(),
    expressionUnit: item.expressionUnit || ExpressionUnitFactory.createJSExpression('', ''),
    description: item.description || `Condition ${index + 1}`,
    lineId: item.lineId,
    mode: item.mode || 'advanced',
    leftVariableKey: item.leftVariableKey || '',
    operator: item.operator || 'eq',
    rightValue: item.rightValue || '',
  }))
}

function createConditionRule(index: number): ConditionRule {
  return {
    id: generateId(),
    expressionUnit: ExpressionUnitFactory.createJSExpression('', ''),
    description: `Condition ${index}`,
    mode: 'simple',
    leftVariableKey: '',
    operator: 'eq',
    rightValue: '',
  }
}

function extractExpr(unit: JSExpressionUnit): string {
  if (!unit) return ''
  return unit.isFunctionMode ? (unit.functionCode || '') : (unit.expressionCode || '')
}

function generateId(): string {
  return `condition_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function commitConditions() {
  update('conditions', [...conditions.value])
}

function commitConditionExpr(idx: number) {
  const cond = conditions.value[idx]
  if (!cond) return

  const text = conditionExprs.value[idx] || ''
  cond.expressionUnit = {
    ...cond.expressionUnit,
    expressionCode: text,
    isFunctionMode: false,
  }
  commitConditions()
}

function commitSimpleCondition(idx: number) {
  const cond = conditions.value[idx]
  if (!cond) return

  const expression = buildSimpleExpression(cond)
  conditionExprs.value[idx] = expression
  cond.expressionUnit = {
    ...cond.expressionUnit,
    expressionCode: expression,
    isFunctionMode: false,
  }
  commitConditions()
}

function buildSimpleExpression(cond: ConditionRule): string {
  if (!cond.leftVariableKey) return ''

  const left = `{{${cond.leftVariableKey}}}`
  const operator = cond.operator || 'eq'
  const right = createRightLiteral(cond.rightValue || '')

  switch (operator) {
    case 'eq':
      return `${left} === ${right}`
    case 'neq':
      return `${left} !== ${right}`
    case 'gt':
      return `${left} > ${right}`
    case 'gte':
      return `${left} >= ${right}`
    case 'lt':
      return `${left} < ${right}`
    case 'lte':
      return `${left} <= ${right}`
    case 'contains':
      return `String(${left} ?? '').includes(${right})`
    case 'notContains':
      return `!String(${left} ?? '').includes(${right})`
    case 'startsWith':
      return `String(${left} ?? '').startsWith(${right})`
    case 'endsWith':
      return `String(${left} ?? '').endsWith(${right})`
    case 'empty':
      return `(${left} == null || ${left} === '')`
    case 'notEmpty':
      return `(${left} != null && ${left} !== '')`
    default:
      return ''
  }
}

function createRightLiteral(value: string): string {
  const text = value.trim()
  if (/^\{\{[^}]+\}\}$/.test(text)) return text
  if (['true', 'false', 'null'].includes(text)) return text
  if (text !== '' && !Number.isNaN(Number(text))) return text
  return JSON.stringify(value)
}

function isUnaryOperator(operator?: ConditionOperator): boolean {
  return operator === 'empty' || operator === 'notEmpty'
}

function handleModeChange(idx: number) {
  const cond = conditions.value[idx]
  if (!cond) return

  if (cond.mode === 'simple') {
    commitSimpleCondition(idx)
  }
  else {
    conditionExprs.value[idx] = extractExpr(cond.expressionUnit)
    commitConditions()
  }
}

function addCondition() {
  const newCond = createConditionRule(conditions.value.length + 1)
  conditions.value.push(newCond)
  conditionExprs.value.push('')
  commitConditions()
}

function removeCondition(idx: number) {
  conditions.value.splice(idx, 1)
  conditionExprs.value.splice(idx, 1)
  commitConditions()
}

function openVariableSelector(idx: number) {
  variableTargetIndex.value = idx
  variableSelectorVisible.value = true
}

function handleVariableSelect(variable: VariableItem) {
  const idx = variableTargetIndex.value
  const cond = conditions.value[idx]
  if (!cond) return

  if (cond.mode !== 'advanced') {
    cond.leftVariableKey = variable.key
    commitSimpleCondition(idx)
    return
  }

  conditionExprs.value[idx] = `${conditionExprs.value[idx] || ''}{{${variable.key}}}`
  commitConditionExpr(idx)
}

watch(() => nodeData.value.conditions, (newConds) => {
  conditions.value = normalizeConditions(newConds)
  conditionExprs.value = conditions.value.map((c: ConditionRule) => extractExpr(c.expressionUnit))
}, { deep: true })
</script>

<style scoped>
.condition-widget {
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

.add-btn,
.remove-btn {
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
}

.add-btn:hover {
  background: var(--nf-bg-elevated, #27272a);
  color: var(--nf-accent, #00d4aa);
}

.widget-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.condition-row {
  position: relative;
  padding: 5px 7px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 5px;
  background: var(--nf-bg-elevated, #18181b);
}

.else-row {
  border-style: dashed;
}

.cond-label,
.simple-rule,
.cond-expr-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cond-label {
  margin-bottom: 4px;
}

.cond-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  background: var(--nf-accent-muted, rgba(0, 212, 170, 0.15));
  color: var(--nf-accent, #00d4aa);
  flex-shrink: 0;
}

.else-badge {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.cond-desc-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--nf-text-body, #8B9DB0);
  padding: 0;
}

.mode-select {
  width: 78px;
  flex-shrink: 0;
}

.variable-select-btn,
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

.variable-select-btn {
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.operator-select {
  width: 86px;
  flex-shrink: 0;
}

.variable-select-btn:hover,
.variable-btn:hover {
  border-color: rgba(0, 255, 159, 0.45);
  color: var(--nf-accent-hover, #33FFB3);
  background: rgba(0, 255, 159, 0.06);
}

.remove-btn {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.remove-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.else-label {
  font-size: 12px;
  font-weight: 600;
  color: #ef4444;
}

.cond-anchor-dot {
  position: absolute;
  right: -7px;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--nf-accent, #00d4aa);
  border: 2px solid var(--nf-bg-card, #09090b);
}

.else-row .cond-anchor-dot {
  background: #ef4444;
}

:deep(.el-input__inner) {
  font-size: 12px;
}

:deep(.el-select__wrapper) {
  min-height: 24px;
  font-size: 12px;
}
</style>
