<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  schema: Record<string, unknown>
  modelValue: Record<string, unknown>
  disabled?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [
        value: Record<string, unknown>,
  ]
}>()
const { t } = useI18n()
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function label(key: string, raw: unknown) {
  const field = record(raw)
  return String(field.title || (['request', 'summary', 'text', 'approved', 'comment'].includes(key) ? t(`product.fields.${key}`) : key))
}
function update(key: string, raw: Event, type: unknown) {
  const element = raw.target as HTMLInputElement
  let value: unknown = element.value
  if (type === 'boolean')
    value = element.checked
  if (type === 'number' || type === 'integer')
    value = element.value === '' ? undefined : Number(element.value)
  if (type === 'array')
    value = element.value.split('\n').filter(Boolean)
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div class="schema-form">
    <label v-for="(raw, key) in record(schema.properties)" :key="key" class="form__field">
      <span>{{ label(String(key), raw) }}<span v-if="Array.isArray(schema.required) && schema.required.includes(key)" class="required-mark"> *</span></span>
      <SchemaForm v-if="record(raw).type === 'object'" :schema="record(raw)" :model-value="record(modelValue[key])" :disabled="disabled" @update:model-value="emit('update:modelValue', { ...modelValue, [key]: $event })" />
      <select v-else-if="Array.isArray(record(raw).enum)" class="input" :value="modelValue[key]" :disabled="disabled" @change="update(String(key), $event, record(raw).type)"><option v-for="value in record(raw).enum as unknown[]" :key="String(value)" :value="String(value)">{{ value }}</option></select>
      <input v-else-if="record(raw).type === 'boolean'" type="checkbox" :checked="modelValue[key] === true" :disabled="disabled" @change="update(String(key), $event, 'boolean')">
      <input v-else-if="['integer', 'number'].includes(String(record(raw).type))" class="input" type="number" :step="record(raw).type === 'integer' ? '1' : 'any'" :value="modelValue[key]" :disabled="disabled" @input="update(String(key), $event, record(raw).type)">
      <textarea v-else class="input preview-input" :value="Array.isArray(modelValue[key]) ? (modelValue[key] as unknown[]).join('\n') : String(modelValue[key] ?? '')" rows="4" :maxlength="Number(record(raw).maxLength || 16000)" :disabled="disabled" @input="update(String(key), $event, record(raw).type)" />
      <small class="field-hint">{{ record(raw).description || (record(raw).type === 'array' ? t('product.onePerLine') : '') }}</small>
    </label>
  </div>
</template>
