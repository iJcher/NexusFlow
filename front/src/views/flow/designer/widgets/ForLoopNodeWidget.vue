<template>
  <div class="widget-node forloop-widget">
    <div class="widget-header">
      <el-icon :size="16" class="widget-icon"><Refresh /></el-icon>
      <input
        v-model="displayName"
        class="widget-title-input"
        @blur="update('displayName', displayName || 'For Loop')"
        @keydown.enter="($event.target as HTMLInputElement)?.blur()"
      />
    </div>
    <div class="loop-meta" @mousedown.stop>
      <span class="meta-label">Times</span>
      <el-input
        v-model="loopExpr"
        size="small"
        placeholder="10"
        class="loop-expr-input"
        @input="commitLoopCount"
      />
    </div>
    <div class="loop-body-placeholder">
      <span class="placeholder-text">Loop container — inner canvas below</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, type Ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import type { JSExpressionUnit } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'
import { ExpressionUnitFactory } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'

const nodeData = inject<Ref<Record<string, any>>>('nodeData')!
const onUpdate = inject<(patch: Record<string, any>) => void>('onUpdate')!

const displayName = ref(nodeData.value.displayName || 'For Loop')

const extractExpr = (): string => {
  const unit = nodeData.value.loopCount as JSExpressionUnit | undefined
  if (!unit) return '10'
  return (unit.expressionCode || '').trim() || '10'
}

const loopExpr = ref(extractExpr())

const update = (key: string, value: any) => onUpdate({ [key]: value })

const commitLoopCount = () => {
  const existing = nodeData.value.loopCount as JSExpressionUnit | undefined
  if (existing) {
    update('loopCount', { ...existing, expressionCode: loopExpr.value, isFunctionMode: false })
  } else {
    update('loopCount', ExpressionUnitFactory.createJSExpression('', loopExpr.value))
  }
}
</script>

<style scoped>
.forloop-widget {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  background: transparent; font-size: 13px; font-weight: 600;
  color: var(--nf-text-primary, #fafafa); padding: 2px 4px; border-radius: 4px;
}
.widget-title-input:focus { background: var(--nf-bg-elevated, #27272a); }

.loop-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta-label {
  font-size: 11px; font-weight: 600;
  color: var(--nf-accent, #00d4aa);
  flex-shrink: 0;
}

.loop-expr-input { width: 120px; }

.loop-body-placeholder {
  flex: 1;
  min-height: 100px;
  border: 1px dashed var(--nf-border, #27272a);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-text {
  font-size: 11px;
  color: var(--nf-text-muted, #52525b);
}

:deep(.el-input__inner) { font-size: 12px; }
</style>
