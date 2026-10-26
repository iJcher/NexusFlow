<script setup lang="ts">
import type { IExecutionSpec } from '@/types/execution-v2.types'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { record, title } from './editor'
import SchemaForm from './SchemaForm.vue'

const props = defineProps<{ modelValue: Record<string, unknown>, schema: IExecutionSpec['inputSchema'], busy: boolean, running: boolean, stopping: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>], 'submit': [], 'cancel': [] }>()
const { t } = useI18n()
const tr = (key: string) => t(`product.${key}`)
const textarea = ref<HTMLTextAreaElement>()
const primary = computed(() => Object.entries(record(props.schema.properties)).find(([, raw]) => record(raw).type === 'string' && !Array.isArray(record(raw).enum))?.[0])
const field = computed(() => record(record(props.schema.properties)[primary.value || '']))
const parameters = computed(() => ({ ...props.schema, properties: Object.fromEntries(Object.entries(record(props.schema.properties)).filter(([key]) => key !== primary.value)) }))
const hasParameters = computed(() => Object.keys(parameters.value.properties).length > 0)
const text = computed(() => String(props.modelValue[primary.value || ''] ?? ''))
function resize() {
  const element = textarea.value
  if (!element)
    return
  element.style.height = '0px'
  element.style.height = `${Math.min(128, Math.max(44, element.scrollHeight))}px`
}
watch([text, textarea], async () => {
  await nextTick()
  resize()
}, { flush: 'post' })
function keydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    if (!props.busy && !props.running)
      emit('submit')
  }
}
function clearText() {
  if (primary.value)
    emit('update:modelValue', { ...props.modelValue, [primary.value]: '' })
}
defineExpose({ clearText })
</script>

<template>
  <form class="preview-composer chat-composer" novalidate @submit.prevent="!busy && !running && emit('submit')">
    <details v-if="hasParameters || !primary" class="composer-parameters" :open="!primary">
      <summary>{{ tr('taskParameters') }}<span class="tiny-badge">{{ Object.keys(parameters.properties).length }}</span></summary>
      <SchemaForm :schema="parameters" :model-value="modelValue" :disabled="busy || running" @update:model-value="emit('update:modelValue', $event)" />
    </details>
    <div class="chat-composer-box">
      <textarea v-if="primary" ref="textarea" class="chat-task-input" rows="1" :aria-label="title(primary, field, tr)" :placeholder="tr('chatPlaceholder')" :value="text" :maxlength="Number(field.maxLength || 16000)" :disabled="busy" @input="emit('update:modelValue', { ...modelValue, [primary]: ($event.target as HTMLTextAreaElement).value })" @keydown="keydown" />
      <span v-else class="muted">{{ tr('parametersReady') }}</span>
      <button v-if="running" class="chat-send chat-stop" type="button" :disabled="stopping" :aria-label="tr('cancelRun')" :title="tr('cancelRun')" @click="emit('cancel')">
        ■
      </button>
      <button v-else class="chat-send" type="submit" :disabled="busy" :aria-label="tr(busy ? 'starting' : 'sendTask')" :title="tr('sendTask')">
        {{ busy ? '⋯' : '↑' }}
      </button>
    </div>
    <small class="composer-hint">{{ tr('chatSendHint') }}</small>
  </form>
</template>
