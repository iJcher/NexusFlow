<template>
  <div class="widget-node reply-widget">
    <div class="widget-header">
      <el-icon :size="16" class="widget-icon"><ChatDotRound /></el-icon>
      <input
        v-model="displayName"
        class="widget-title-input"
        @blur="update('displayName', displayName || 'Reply')"
        @keydown.enter="($event.target as HTMLInputElement)?.blur()"
      />
    </div>
    <div class="widget-body" @mousedown.stop>
      <div class="widget-field">
        <label class="field-label">{{ t('flowComponents.replyContent') || 'Reply Content' }}</label>
        <el-input
          v-model="messageText"
          type="textarea"
          :rows="3"
          placeholder="留空将自动回复上一节点输出，例如 LLM 的流式回答"
          resize="vertical"
          size="small"
          @input="commitMessage"
        />
        <p class="field-hint">
          无需手写变量：常规 AI 问答保持留空即可；只有需要固定前缀或模板时再填写。
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChatDotRound } from '@element-plus/icons-vue'
import { ExpressionUnitFactory } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'
import type { AnyExpressionUnit } from '@/types/flow-designer/ExpressionUnits/ExpressionUnitBase'

const { t } = useI18n()
const nodeData = inject<Ref<Record<string, any>>>('nodeData')!
const onUpdate = inject<(patch: Record<string, any>) => void>('onUpdate')!

const displayName = ref(nodeData.value.displayName || 'Reply')

const extractText = (unit: AnyExpressionUnit | string | undefined): string => {
  if (!unit) return ''
  if (typeof unit === 'string') return unit
  if (unit.typeName === 'FullTextExpressionUnit') return (unit as any).Text || ''
  return ''
}

const messageText = ref(extractText(nodeData.value.message))

const update = (key: string, value: any) => onUpdate({ [key]: value })

const commitMessage = () => {
  const existing = nodeData.value.message as AnyExpressionUnit | undefined
  if (existing && existing.typeName === 'FullTextExpressionUnit') {
    update('message', { ...existing, Text: messageText.value })
  } else {
    update('message', ExpressionUnitFactory.createFullTextExpression(messageText.value))
  }
}
</script>

<style scoped>
.reply-widget {
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

.field-label {
  font-size: 12px; font-weight: 500;
  color: var(--nf-text-secondary, #a1a1aa); line-height: 1.3;
}

.field-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--nf-text-body, #8B9DB0);
}

:deep(.el-textarea__inner) { font-size: 12px; min-height: 36px !important; padding: 4px 7px; }
</style>
