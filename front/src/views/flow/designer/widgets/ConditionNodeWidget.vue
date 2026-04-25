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
        </div>
        <div class="cond-expr-row">
          <el-input
            v-model="conditionExprs[idx]"
            size="small"
            placeholder="e.g. age > 18"
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
import { ref, inject, type Ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Share, Plus, Close } from '@element-plus/icons-vue'
import { ExpressionUnitFactory } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'
import type { JSExpressionUnit } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'
import type { VariableItem } from '@/types/flow-designer/variableSelector.types'
import VariableSelector from '../components/VariableSelector.vue'

const { t } = useI18n()

interface ConditionRule {
  id: string;
  expressionUnit: JSExpressionUnit;
  description?: string;
  lineId?: string;
}

const nodeData = inject<Ref<Record<string, any>>>('nodeData')!
const nodeId = inject<string>('nodeId')
const onUpdate = inject<(patch: Record<string, any>) => void>('onUpdate')!

const displayName = ref(nodeData.value.displayName || 'Condition')
const conditions = ref<ConditionRule[]>([...(nodeData.value.conditions || [])])

const extractExpr = (unit: JSExpressionUnit): string => {
  if (!unit) return ''
  return unit.isFunctionMode ? (unit.functionCode || '') : (unit.expressionCode || '')
}

const conditionExprs = ref<string[]>(conditions.value.map(c => extractExpr(c.expressionUnit)))
const variableSelectorVisible = ref(false)
const variableTargetIndex = ref(0)

const update = (key: string, value: any) => onUpdate({ [key]: value })

const commitConditions = () => {
  update('conditions', [...conditions.value])
}

const commitConditionExpr = (idx: number) => {
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

const generateId = () => `condition_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

const addCondition = () => {
  const newCond: ConditionRule = {
    id: generateId(),
    expressionUnit: ExpressionUnitFactory.createJSExpression(''),
    description: `Condition ${conditions.value.length + 1}`,
  }
  conditions.value.push(newCond)
  conditionExprs.value.push('')
  commitConditions()
}

const removeCondition = (idx: number) => {
  conditions.value.splice(idx, 1)
  conditionExprs.value.splice(idx, 1)
  commitConditions()
}

const openVariableSelector = (idx: number) => {
  variableTargetIndex.value = idx
  variableSelectorVisible.value = true
}

const handleVariableSelect = (variable: VariableItem) => {
  const idx = variableTargetIndex.value
  conditionExprs.value[idx] = `${conditionExprs.value[idx] || ''}{{${variable.key}}}`
  commitConditionExpr(idx)
}

watch(() => nodeData.value.conditions, (newConds) => {
  if (newConds && Array.isArray(newConds)) {
    conditions.value = [...newConds]
    conditionExprs.value = newConds.map((c: ConditionRule) => extractExpr(c.expressionUnit))
  }
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

.add-btn {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border: none; border-radius: 4px;
  background: transparent; color: var(--nf-text-muted, #a1a1aa); cursor: pointer;
}
.add-btn:hover { background: var(--nf-bg-elevated, #27272a); color: var(--nf-accent, #00d4aa); }

.widget-body { display: flex; flex-direction: column; gap: 4px; }

.condition-row {
  position: relative;
  padding: 4px 7px;
  border: 1px solid var(--nf-border, #27272a);
  border-radius: 5px;
  background: var(--nf-bg-elevated, #18181b);
}

.else-row { border-style: dashed; }

.cond-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.cond-index {
  display: flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 4px;
  font-size: 10px; font-weight: 700;
  background: var(--nf-accent-muted, rgba(0,212,170,0.15));
  color: var(--nf-accent, #00d4aa);
}

.else-badge {
  background: rgba(239,68,68,0.15);
  color: #ef4444;
}

.cond-desc-input {
  flex: 1; min-width: 0; border: none; outline: none;
  background: transparent; font-size: 11px; font-weight: 500;
  color: var(--nf-text-secondary, #a1a1aa); padding: 0;
}

.else-label {
  font-size: 11px; font-weight: 600; color: #ef4444;
}

.cond-expr-row {
  display: flex; align-items: center; gap: 4px;
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

.variable-btn:hover {
  border-color: rgba(0, 255, 159, 0.45);
  color: var(--nf-accent-hover, #33FFB3);
  background: rgba(0, 255, 159, 0.06);
}

.remove-btn {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border: none; border-radius: 4px;
  background: transparent; color: var(--nf-text-muted, #71717a); cursor: pointer;
}
.remove-btn:hover { color: #ef4444; background: rgba(239,68,68,0.1); }

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

.else-row .cond-anchor-dot { background: #ef4444; }

:deep(.el-input__inner) { font-size: 11px; }
</style>
