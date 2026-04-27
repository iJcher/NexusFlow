<template>
  <div class="widget-node condition-widget" @wheel.stop>
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

        <Handle
          type="source"
          :position="Position.Right"
          :id="cond.id"
          class="cond-branch-handle"
          :aria-label="t('flowDesigner.addNextNode')"
          @pointerdown="recordPointerDown"
          @click.stop="handleBranchPlusClick(cond.id, $event)"
        />
      </div>

      <div class="condition-row else-row">
        <div class="cond-label">
          <span class="cond-index else-badge">E</span>
          <span class="else-label">ELSE</span>
        </div>
        <Handle
          type="source"
          :position="Position.Right"
          :id="elseRule.id"
          class="cond-branch-handle else-handle"
          :aria-label="t('flowDesigner.addNextNode')"
          @pointerdown="recordPointerDown"
          @click.stop="handleBranchPlusClick(elseRule.id, $event)"
        />
      </div>
    </div>

    <Transition name="selector-fade">
      <div
        v-if="branchSelectorOpen"
        class="condition-node-selector"
        @click.stop
        @mousedown.stop
      >
        <div class="selector-header">
          <span>{{ t('flowDesigner.addNextNode') }}</span>
          <button class="selector-close" @click="branchSelectorOpen = false">×</button>
        </div>
        <div class="selector-list">
          <button
            v-for="n in filteredNodeList"
            :key="n.typeName"
            class="selector-item"
            @click="handleSelectNextNode(n.typeName)"
          >
            <span class="selector-item-name">{{ n.name }}</span>
            <span class="selector-item-desc">{{ n.description }}</span>
          </button>
          <div v-if="filteredNodeList.length === 0" class="selector-empty">
            {{ t('flowDesigner.noAvailableNode') }}
          </div>
        </div>
      </div>
    </Transition>

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
import { Handle, Position } from '@vue-flow/core'
import { Share, Plus, Close } from '@element-plus/icons-vue'
import type { NodeConfig } from '@/types/flow-designer/nodeConfig'
import { ExpressionUnitFactory } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'
import type { JSExpressionUnit } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'
import type { VariableItem } from '@/types/flow-designer/variableSelector.types'
import { getAvailableNextNodeTypes } from '@/utils/flowNodeRules'
import VariableSelector from '../components/VariableSelector.vue'

type ConditionMode = 'simple' | 'advanced'
type ConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'empty' | 'notEmpty'

interface ElseRule {
  id: string
  description?: string
  lineId?: string
  expressionUnit?: JSExpressionUnit
}

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
const nodeList = inject<Ref<NodeConfig[]>>('availableNodes', ref<NodeConfig[]>([]))
const addNodeAndConnect = inject<(sourceId: string, sourceHandle: string, nodeType: string) => void>('addNodeAndConnect', () => {})

const displayName = ref<string>(String(nodeData.value.displayName || 'Condition'))
const conditions = ref<ConditionRule[]>(normalizeConditions(nodeData.value.conditions))
const elseRule = ref<ElseRule>(normalizeElseRule(nodeData.value.elseRule))
const conditionExprs = ref<string[]>(conditions.value.map(c => extractExpr(c.expressionUnit)))
const variableSelectorVisible = ref<boolean>(false)
const variableTargetIndex = ref<number>(0)
const branchSelectorOpen = ref<boolean>(false)
const activeBranchHandle = ref<string>('')
const pointerDownPosition = ref<{ x: number; y: number } | null>(null)

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
const filteredNodeList = computed<NodeConfig[]>(() => {
  const allowedTypes = getAvailableNextNodeTypes('ConditionNode')
  return nodeList.value.filter(n => allowedTypes.includes(n.typeName))
})

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

function normalizeElseRule(value: unknown): ElseRule {
  const item = (value || {}) as Partial<ElseRule>
  return {
    id: item.id || `else_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    expressionUnit: item.expressionUnit || ExpressionUnitFactory.createJSExpression('', ''),
    description: item.description || 'Else branch',
    lineId: item.lineId,
  }
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
  update('elseRule', { ...elseRule.value })
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

function recordPointerDown(event: PointerEvent) {
  pointerDownPosition.value = { x: event.clientX, y: event.clientY }
}

function handleBranchPlusClick(branchHandle: string, event: MouseEvent) {
  const start = pointerDownPosition.value
  pointerDownPosition.value = null
  if (start) {
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (moved > 5) return
  }

  const isSameBranch = activeBranchHandle.value === branchHandle
  branchSelectorOpen.value = !(branchSelectorOpen.value && isSameBranch)
  activeBranchHandle.value = branchHandle
}

function handleSelectNextNode(nodeType: string) {
  if (!nodeId || !activeBranchHandle.value) return
  addNodeAndConnect(nodeId, activeBranchHandle.value, nodeType)
  branchSelectorOpen.value = false
}

watch(() => nodeData.value.conditions, (newConds) => {
  conditions.value = normalizeConditions(newConds)
  conditionExprs.value = conditions.value.map((c: ConditionRule) => extractExpr(c.expressionUnit))
}, { deep: true })

watch(() => nodeData.value.elseRule, (newElseRule) => {
  elseRule.value = normalizeElseRule(newElseRule)
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
  overflow: visible;
  position: relative;
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
  padding: 5px 32px 5px 7px;
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

.cond-branch-handle {
  right: 6px;
  top: 50%;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--nf-bg-surface, #080B10);
  border: 1px solid rgba(0, 255, 159, 0.35);
  color: var(--nf-accent, #00FF9F);
  box-shadow: var(--nf-glow-sm);
  cursor: crosshair;
  transform: translateY(-50%);
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.cond-branch-handle::before,
.cond-branch-handle::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 1.6px;
  border-radius: 999px;
  background: currentColor;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.cond-branch-handle::after {
  transform: translate(-50%, -50%) rotate(90deg);
}

.cond-branch-handle:hover {
  border-color: var(--nf-accent-hover, #33FFB3);
  color: var(--nf-accent-hover, #33FFB3);
  background: rgba(0, 255, 159, 0.06);
  box-shadow: var(--nf-glow-md);
}

.else-handle {
  border-color: rgba(239, 68, 68, 0.45);
  color: #ef4444;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.2);
}

.else-handle:hover {
  border-color: #fca5a5;
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.06);
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.25);
}

.condition-node-selector {
  position: absolute;
  right: -230px;
  top: 40px;
  width: 210px;
  background: rgba(8, 11, 16, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  overflow: hidden;
  z-index: 100;
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}

.selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--nf-text-body, #8B9DB0);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.selector-close {
  border: none;
  background: transparent;
  font-size: 14px;
  cursor: pointer;
  color: var(--nf-text-secondary, #6B7D8E);
  line-height: 1;
  padding: 0 2px;
}

.selector-close:hover {
  color: var(--nf-accent, #00FF9F);
}

.selector-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 4px;
}

.selector-item {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-left: 2px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.selector-item:hover {
  background: rgba(0, 255, 159, 0.06);
  border-left-color: var(--nf-accent, #00FF9F);
}

.selector-item-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--nf-text-body, #8B9DB0);
  line-height: 1.3;
}

.selector-item:hover .selector-item-name {
  color: var(--nf-text-primary, #E6EDF3);
}

.selector-item-desc {
  font-size: 12px;
  color: var(--nf-text-tertiary, #4A5C6E);
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selector-empty {
  padding: 10px 8px;
  color: var(--nf-text-secondary, #6B7D8E);
  font-size: 12px;
  line-height: 1.5;
}

.selector-fade-enter-active,
.selector-fade-leave-active {
  transition: opacity 0.2s ease;
}

.selector-fade-enter-from,
.selector-fade-leave-to {
  opacity: 0;
}

:deep(.el-input__inner) {
  font-size: 12px;
}

:deep(.el-select__wrapper) {
  min-height: 24px;
  font-size: 12px;
}
</style>
