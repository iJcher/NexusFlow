<template>
  <div class="widget-node assign-widget">
    <div class="widget-header">
      <el-icon :size="16" class="widget-icon"><EditPen /></el-icon>
      <input
        v-model="displayName"
        class="widget-title-input"
        @blur="update('displayName', displayName || 'Assign')"
        @keydown.enter="($event.target as HTMLInputElement)?.blur()"
      />
      <button class="add-btn" @click.stop="addAssignment" title="Add assignment">
        <el-icon :size="14"><Plus /></el-icon>
      </button>
    </div>

    <div class="widget-body" @mousedown.stop>
      <div
        v-for="(item, idx) in assignments"
        :key="item.id"
        class="assign-row"
      >
        <el-input
          v-model="item.targetVariableName"
          size="small"
          placeholder="Variable name"
          class="var-name-input"
          @input="commitAssignments"
        />
        <span class="assign-op">=</span>
        <el-input
          v-model="assignExprs[idx]"
          size="small"
          placeholder="Expression"
          class="expr-input"
          @input="commitAssignExpr(idx)"
        />
        <button v-if="assignments.length > 1" class="remove-btn" @click.stop="removeAssignment(idx)">
          <el-icon :size="12"><Close /></el-icon>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, type Ref, watch } from 'vue'
import { EditPen, Plus, Close } from '@element-plus/icons-vue'
import { ExpressionUnitFactory } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'
import type { JSExpressionUnit } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'

interface AssignmentItem {
  id: string;
  targetVariableName: string;
  expressionUnit: JSExpressionUnit;
}

const nodeData = inject<Ref<Record<string, any>>>('nodeData')!
const onUpdate = inject<(patch: Record<string, any>) => void>('onUpdate')!

const displayName = ref(nodeData.value.displayName || 'Assign')
const assignments = ref<AssignmentItem[]>([...(nodeData.value.assignments || [])])

const extractExpr = (unit: JSExpressionUnit): string => {
  if (!unit) return ''
  return unit.isFunctionMode ? (unit.functionCode || '') : (unit.expressionCode || '')
}

const assignExprs = ref<string[]>(assignments.value.map(a => extractExpr(a.expressionUnit)))

const update = (key: string, value: any) => onUpdate({ [key]: value })

const commitAssignments = () => {
  update('assignments', [...assignments.value])
}

const commitAssignExpr = (idx: number) => {
  const item = assignments.value[idx]
  if (!item) return
  item.expressionUnit = {
    ...item.expressionUnit,
    expressionCode: assignExprs.value[idx] || '',
    isFunctionMode: false,
  }
  commitAssignments()
}

const generateId = () => `assign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

const addAssignment = () => {
  const newItem: AssignmentItem = {
    id: generateId(),
    targetVariableName: '',
    expressionUnit: ExpressionUnitFactory.createJSExpression(''),
  }
  assignments.value.push(newItem)
  assignExprs.value.push('')
  commitAssignments()
}

const removeAssignment = (idx: number) => {
  assignments.value.splice(idx, 1)
  assignExprs.value.splice(idx, 1)
  commitAssignments()
}

watch(() => nodeData.value.assignments, (newItems) => {
  if (newItems && Array.isArray(newItems)) {
    assignments.value = [...newItems]
    assignExprs.value = newItems.map((a: AssignmentItem) => extractExpr(a.expressionUnit))
  }
}, { deep: true })
</script>

<style scoped>
.assign-widget {
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

.widget-body { display: flex; flex-direction: column; gap: 6px; }

.assign-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.var-name-input { width: 100px; flex-shrink: 0; }
.assign-op {
  font-size: 13px; font-weight: 700;
  color: var(--nf-text-muted, #71717a);
  flex-shrink: 0;
}
.expr-input { flex: 1; min-width: 0; }

.remove-btn {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border: none; border-radius: 4px;
  background: transparent; color: var(--nf-text-muted, #71717a); cursor: pointer;
}
.remove-btn:hover { color: #ef4444; background: rgba(239,68,68,0.1); }

:deep(.el-input__inner) { font-size: 11px; }
</style>
