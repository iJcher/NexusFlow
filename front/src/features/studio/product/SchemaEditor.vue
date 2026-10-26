<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { record, title } from './editor'

const props = defineProps<{
  modelValue: Record<string, unknown>
}>()
const emit = defineEmits<{
  'update:modelValue': [
        value: Record<string, unknown>,
  ]
}>()
const { t } = useI18n()
const tr = (key: string) => t(`product.${key}`)
function change(key: string, patch: Record<string, unknown>) {
  emit('update:modelValue', { ...props.modelValue, properties: { ...record(props.modelValue.properties), [key]: { ...record(record(props.modelValue.properties)[key]), ...patch } } })
}
function required(key: string, checked: boolean) {
  const keys = new Set(Array.isArray(props.modelValue.required) ? props.modelValue.required as string[] : [])
  if (checked)
    keys.add(key)
  else
    keys.delete(key)
  emit('update:modelValue', { ...props.modelValue, required: [...keys] })
}
function remove(key: string) {
  const properties = { ...record(props.modelValue.properties) }
  delete properties[key]
  emit('update:modelValue', { ...props.modelValue, properties, required: (Array.isArray(props.modelValue.required) ? props.modelValue.required : []).filter(item => item !== key) })
}
function add() {
  const properties = record(props.modelValue.properties)
  let key = `field_${Object.keys(properties).length + 1}`
  while (key in properties)
    key += '_'
  emit('update:modelValue', { ...props.modelValue, type: 'object', properties: { ...properties, [key]: { type: 'string', title: tr('newField') } } })
}
</script>

<template>
  <div class="schema-editor">
    <div v-for="(field, key) in record(modelValue.properties)" :key="key" class="schema-field-row">
      <input class="input" :aria-label="tr('fieldName')" :value="title(String(key), record(field), tr)" @input="change(String(key), { title: ($event.target as HTMLInputElement).value })">
      <select class="input" :aria-label="tr('fieldType')" :value="record(field).type || 'string'" @change="change(String(key), { type: ($event.target as HTMLSelectElement).value })">
        <option value="string">
          {{ tr('types.string') }}
        </option><option value="number">
          {{ tr('types.number') }}
        </option><option value="boolean">
          {{ tr('types.boolean') }}
        </option><option v-if="['object', 'array'].includes(String(record(field).type))" :value="String(record(field).type)">
          {{ tr('types.structured') }}
        </option>
      </select>
      <label class="checkbox-label"><input type="checkbox" :checked="Array.isArray(modelValue.required) && modelValue.required.includes(key)" @change="required(String(key), ($event.target as HTMLInputElement).checked)">{{ tr('required') }}</label>
      <button class="btn btn-icon" :aria-label="tr('removeField')" @click="remove(String(key))">
        ×
      </button>
    </div>
    <button class="btn btn-quiet" @click="add">
      ＋ {{ tr('addField') }}
    </button>
  </div>
</template>
