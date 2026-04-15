<template>
  <div class="widget-node jscode-widget">
    <div class="widget-header">
      <el-icon :size="16" class="widget-icon"><Document /></el-icon>
      <input
        v-model="displayName"
        class="widget-title-input"
        @blur="update('displayName', displayName || 'JS Code')"
        @keydown.enter="($event.target as HTMLInputElement)?.blur()"
      />
      <button class="toggle-btn" @click="collapsed = !collapsed">
        <el-icon :size="14"><ArrowUp v-if="!collapsed" /><ArrowDown v-else /></el-icon>
      </button>
    </div>

    <template v-if="!collapsed">
      <div class="widget-body" @mousedown.stop>
        <div class="widget-field">
          <label class="field-label">Code</label>
          <el-input
            v-model="codeText"
            type="textarea"
            :rows="8"
            placeholder="function main() { ... }"
            resize="vertical"
            size="small"
            class="code-editor"
            @input="commitCode"
          />
        </div>
      </div>
    </template>
    <div v-else class="collapsed-summary">
      <span class="summary-text">{{ codePreview }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, type Ref } from 'vue'
import { Document, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import type { JSExpressionUnit } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'
import { ExpressionUnitFactory } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'

const nodeData = inject<Ref<Record<string, any>>>('nodeData')!
const onUpdate = inject<(patch: Record<string, any>) => void>('onUpdate')!

const collapsed = ref(false)
const displayName = ref(nodeData.value.displayName || 'JS Code')

const extractCode = (): string => {
  const unit = nodeData.value.codeUnit as JSExpressionUnit | undefined
  if (!unit) return ''
  return unit.isFunctionMode ? (unit.functionCode || '') : (unit.expressionCode || '')
}

const codeText = ref(extractCode())

const codePreview = computed(() => {
  const text = codeText.value.trim()
  return text.length > 40 ? text.substring(0, 40) + '...' : (text || 'No code')
})

const update = (key: string, value: any) => onUpdate({ [key]: value })

const commitCode = () => {
  const existing = nodeData.value.codeUnit as JSExpressionUnit | undefined
  if (existing) {
    const updated = { ...existing }
    if (existing.isFunctionMode) {
      updated.functionCode = codeText.value
    } else {
      updated.expressionCode = codeText.value
    }
    update('codeUnit', updated)
  } else {
    const unit = ExpressionUnitFactory.createJSExpression(codeText.value, '')
    unit.isFunctionMode = true
    update('codeUnit', unit)
  }
}
</script>

<style scoped>
.jscode-widget {
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

.widget-body { display: flex; flex-direction: column; gap: 6px; flex: 1; }

.widget-field { display: flex; flex-direction: column; gap: 3px; flex: 1; }

.field-label {
  font-size: 11px; font-weight: 500;
  color: var(--nf-text-secondary, #a1a1aa);
}

.code-editor :deep(.el-textarea__inner) {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.4;
  tab-size: 2;
  padding: 4px 7px;
}

.collapsed-summary { padding: 2px 0; }
.summary-text {
  font-size: 11px; color: var(--nf-text-muted, #a1a1aa);
  font-family: 'SF Mono', 'Fira Code', monospace;
}
</style>
