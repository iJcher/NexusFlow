<script setup lang="ts">
import type { ComputedRef } from 'vue'
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownText from './MarkdownText.vue'

const props = defineProps<{
  value: unknown
}>()
const { t, te } = useI18n()
const errorCode = computed(() => props.value && typeof props.value === 'object' && !Array.isArray(props.value) && Object.keys(props.value).length === 1 && 'code' in props.value && typeof props.value.code === 'string' ? props.value.code : '')
const labels = inject<ComputedRef<Record<string, string>>>('resultLabels', computed(() => ({})))
function friendly(key: string) {
  return labels.value[key] || Object.entries(labels.value).find(([id]) => key.endsWith(`/node/${id}`))?.[1] || key
}
const entries = computed(() => props.value && typeof props.value === 'object' && !Array.isArray(props.value) ? Object.entries(props.value).filter(([key]) => !['decisionId', 'invocationId', 'nodeId', 'source', 'untrustedContent', 'toolVersion'].includes(key)) : [])
function label(key: string) {
  return labels.value[key] || (te(`product.fields.${key}`) ? t(`product.fields.${key}`) : friendly(key))
}
</script>

<template>
  <p v-if="value == null" class="muted">
    {{ t('product.emptyResult') }}
  </p>
  <p v-else-if="errorCode" class="result-text">
    {{ te(`product.errors.${errorCode}`) ? t(`product.errors.${errorCode}`) : t('product.errors.EXECUTION_FAILED') }}
  </p>
  <div v-else-if="Array.isArray(value)" class="result-list">
    <ResultView v-for="(item, index) in value" :key="index" :value="item" />
  </div>
  <dl v-else-if="entries.length" class="result-fields">
    <div v-for="[key, item] in entries" :key="key">
      <dt>{{ label(key) }}</dt><dd><ResultView :value="item" /></dd>
    </div>
  </dl>
  <p v-else-if="typeof value === 'object'" class="muted">
    {{ t('product.emptyResult') }}
  </p>
  <MarkdownText v-else-if="typeof value === 'string'" :text="friendly(value)" />
  <p v-else class="result-text">
    {{ typeof value === 'boolean' ? (value ? t('product.yes') : t('product.no')) : typeof value === 'string' ? friendly(value) : value }}
  </p>
</template>
