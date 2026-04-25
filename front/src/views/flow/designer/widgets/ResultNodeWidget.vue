<template>
  <div class="widget-node result-widget">
    <div class="widget-header">
      <el-icon :size="16" class="widget-icon"><Promotion /></el-icon>
      <span class="widget-title">{{ displayName }}</span>
      <span :class="['status-dot', status]" />
    </div>

    <div class="widget-body" @mousedown.stop>
      <div class="input-section">
        <el-input
          v-model="query"
          type="textarea"
          :rows="2"
          :placeholder="t('flowDesigner.enterQuery') || 'Enter your query...'"
          size="small"
          resize="none"
          :disabled="status === 'running'"
        />
        <div class="run-actions">
          <el-button
            v-if="status !== 'running'"
            type="primary"
            size="small"
            :icon="VideoPlay"
            :disabled="!query.trim() || !flowId"
            @click="runWorkflow"
          >
            {{ t('flowDesigner.run') }}
          </el-button>
          <el-button
            v-else
            type="danger"
            size="small"
            :icon="VideoPause"
            @click="abort"
          >
            {{ t('flowDesigner.stop') || 'Stop' }}
          </el-button>
          <span v-if="!flowId" class="hint-text">{{ t('flowDesigner.saveFirst') || 'Save flow first' }}</span>
        </div>
      </div>

      <div class="output-section" ref="outputRef">
        <div v-if="status === 'idle' && !result" class="output-placeholder">
          <el-icon :size="24" class="placeholder-icon"><Monitor /></el-icon>
          <span>{{ t('flowDesigner.resultWillAppear') || 'Result will appear here' }}</span>
        </div>

        <div v-else-if="status === 'running'" class="output-content">
          <div class="result-text" v-html="renderedResult" />
          <div class="loading-indicator">
            <span class="dot-pulse" />
          </div>
        </div>

        <div v-else-if="status === 'error'" class="output-content error">
          <el-icon :size="16"><WarningFilled /></el-icon>
          <span>{{ errorMessage || 'Execution failed' }}</span>
        </div>

        <div v-else class="output-content">
          <div class="result-text" v-html="renderedResult" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, nextTick, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Promotion, VideoPlay, VideoPause, Monitor, WarningFilled } from '@element-plus/icons-vue'
import { useFlowDesignerStore } from '@/stores/flowDesigner'

const { t } = useI18n()

const nodeData = inject<Ref<Record<string, any>>>('nodeData')!
const onUpdate = inject<(patch: Record<string, any>) => void>('onUpdate')!

const flowStore = useFlowDesignerStore()
const flowId = computed(() => flowStore.currentFlowId)

const displayName = computed(() => nodeData.value.displayName || 'Result')

const query = ref('')
const result = ref('')
const status = ref<'idle' | 'running' | 'done' | 'error'>('idle')
const errorMessage = ref('')
const outputRef = ref<HTMLElement | null>(null)
let abortController: AbortController | null = null

const renderedResult = computed(() => {
  return result.value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
})

const getCommonHeaders = () => {
  const tokenInfo = JSON.parse(localStorage.getItem('tokenInfo') || 'null')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (tokenInfo?.type && tokenInfo?.accessToken) {
    headers.Authorization = `${tokenInfo.type} ${tokenInfo.accessToken}`
  }
  const phone = localStorage.getItem('phoneNumber')
  if (phone) headers.phoneNumber = phone
  const language = localStorage.getItem('lang') || 'zh-CN'
  headers['Accept-Language'] = language
  headers['X-Language'] = language
  return headers
}

const scrollToBottom = () => {
  nextTick(() => {
    if (outputRef.value) {
      outputRef.value.scrollTop = outputRef.value.scrollHeight
    }
  })
}

const runWorkflow = async () => {
  if (!query.value.trim() || !flowId.value || status.value === 'running') return

  status.value = 'running'
  result.value = ''
  errorMessage.value = ''
  onUpdate({ status: 'running', query: query.value })

  abortController = new AbortController()

  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL || ''
    const response = await fetch(`${apiBase}/Flow/chat-messages/${flowId.value}`, {
      method: 'POST',
      headers: getCommonHeaders(),
      body: JSON.stringify({
        query: query.value.trim(),
        user: localStorage.getItem('phoneNumber') || 'anonymous',
        conversationId: '',
        files: [],
      }),
      signal: abortController.signal,
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    if (!reader) throw new Error('No response body')

    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6).trim()
          if (data === '[DONE]') break

          let event: { event?: string, answer?: string, message?: string } | null = null
          try {
            event = JSON.parse(data) as { event?: string, answer?: string, message?: string }
          } catch {
            // skip malformed events
          }
          if (event?.event === 'message' && event.answer) {
            result.value += event.answer
            scrollToBottom()
          } else if (event?.event === 'error') {
            throw new Error(event.message || 'Workflow execution failed')
          }
        }
      }
    }

    if (!result.value.trim()) {
      result.value = '工作流已结束，但没有产生回复。请确认流程中存在 Reply 节点，并且 Reply 连接到了 LLM 或其他有输出的节点。'
    }
    status.value = 'done'
    onUpdate({ status: 'done', result: result.value })
  } catch (err: any) {
    if (err.name === 'AbortError') {
      status.value = 'done'
      onUpdate({ status: 'done', result: result.value })
    } else {
      status.value = 'error'
      errorMessage.value = err.message || 'Unknown error'
      onUpdate({ status: 'error' })
    }
  } finally {
    abortController = null
  }
}

const abort = () => {
  abortController?.abort()
}
</script>

<style scoped>
.result-widget {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.widget-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.widget-icon { color: var(--nf-accent, #00d4aa); flex-shrink: 0; }

.widget-title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--nf-text-primary, #fafafa);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.idle { background: var(--nf-text-muted, #52525b); }
.status-dot.running { background: #f59e0b; animation: pulse 1.5s infinite; }
.status-dot.done { background: #22c55e; }
.status-dot.error { background: #ef4444; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.widget-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.input-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.run-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hint-text {
  font-size: 11px;
  color: var(--nf-text-muted, #71717a);
}

.output-section {
  flex: 1;
  min-height: 80px;
  border: 1px solid var(--nf-border, #27272a);
  border-radius: 8px;
  background: var(--nf-bg-elevated, #18181b);
  overflow-y: auto;
  padding: 10px;
}

.output-section::-webkit-scrollbar { width: 3px; }
.output-section::-webkit-scrollbar-thumb {
  background: var(--nf-scrollbar, #52525b); border-radius: 2px;
}

.output-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  min-height: 60px;
  color: var(--nf-text-muted, #52525b);
  font-size: 12px;
}

.placeholder-icon { color: var(--nf-text-muted, #3f3f46); }

.output-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--nf-text-primary, #e4e4e7);
  word-break: break-word;
}

.output-content.error {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #ef4444;
  font-size: 12px;
}

.result-text { white-space: pre-wrap; }

.loading-indicator {
  display: flex;
  align-items: center;
  padding-top: 4px;
}

.dot-pulse {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nf-accent, #00d4aa);
  animation: dotPulse 1.4s infinite both;
}

@keyframes dotPulse {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

:deep(.el-textarea__inner) { font-size: 11px; padding: 4px 7px; }
</style>
