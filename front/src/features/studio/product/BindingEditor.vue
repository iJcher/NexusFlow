<script setup lang="ts">
import type { IBindingOption } from './editor'
import type { IBinding } from '@/types/execution-v2.types'
import { useI18n } from 'vue-i18n'
import { record, sameBinding, scalar, title } from './editor'

const props = withDefaults(defineProps<{
  modelValue: Record<string, IBinding>
  options: IBindingOption[]
  schema?: Record<string, unknown>
  fixed?: boolean
  allowLiteral?: boolean
}>(), { allowLiteral: true })
const emit = defineEmits<{
  'update:modelValue': [
        value: Record<string, IBinding>,
  ]
}>()
const { t, te } = useI18n()
const tr = (key: string) => t(`product.${key}`)
function set(key: string, value: IBinding) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
function selected(value: IBinding) {
  return value.source === 'literal' ? 'literal' : props.options.find(item => sameBinding(item.binding, value))?.id || 'missing'
}
function select(key: string, event: Event) {
  const value = (event.target as HTMLSelectElement).value
  const field = record(record(props.schema?.properties)[key])
  set(key, value === 'literal' ? { source: 'literal', value: Array.isArray(field.enum) ? field.enum[0] : '' } : props.options.find(item => item.id === value)?.binding || { source: 'literal', value: '' })
}
function add() {
  let key = `field_${Object.keys(props.modelValue).length + 1}`
  while (key in props.modelValue)
    key += '_'
  set(key, { source: 'literal', value: '' })
}
function rename(old: string, event: Event) {
  const key = (event.target as HTMLInputElement).value.trim()
  if (!key || key === old || key in props.modelValue)
    return
  const value = { ...props.modelValue }
  delete value[old]
  value[key] = props.modelValue[old]
  emit('update:modelValue', value)
}
function remove(key: string) {
  const value = { ...props.modelValue }
  delete value[key]
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="binding-fields">
    <div v-for="(binding, key) in modelValue" :key="key" class="binding-field">
      <span v-if="fixed" class="binding-label">{{ title(String(key), record(record(schema?.properties)[key]), tr) }}</span>
      <input v-else class="input binding-name" :aria-label="tr('fieldName')" :value="title(String(key), {}, tr)" @change="rename(String(key), $event)">
      <select class="input" :aria-label="`${title(String(key), {}, tr)} ${tr('valueFrom')}`" :value="selected(binding)" @change="select(String(key), $event)">
        <option v-if="allowLiteral !== false" value="literal">
          {{ tr('constant') }}
        </option><option v-if="selected(binding) === 'missing'" value="missing" disabled>
          {{ tr('bindingMissing') }}
        </option>
        <option v-for="option in options" :key="option.id" :value="option.id">
          {{ option.label }}
        </option>
      </select>
      <div v-if="binding.source === 'literal'" class="literal-field">
        <select v-if="Array.isArray(record(record(schema?.properties)[key]).enum)" class="input literal-enum" :aria-label="title(String(key), record(record(schema?.properties)[key]), tr)" :value="binding.value" @change="set(String(key), { source: 'literal', value: ($event.target as HTMLSelectElement).value })">
          <option v-for="value in record(record(schema?.properties)[key]).enum as string[]" :key="value" :value="value">
            {{ te(`product.toolEnums.${value}`) ? tr(`toolEnums.${value}`) : value }}
          </option>
        </select>
        <template v-else>
          <select class="input literal-type" :aria-label="tr('fieldType')" :value="typeof binding.value === 'number' ? 'number' : typeof binding.value === 'boolean' ? 'boolean' : 'string'" @change="set(String(key), { source: 'literal', value: scalar('', ($event.target as HTMLSelectElement).value) })">
            <option value="string">
              {{ tr('types.string') }}
            </option><option value="number">
              {{ tr('types.number') }}
            </option><option value="boolean">
              {{ tr('types.boolean') }}
            </option>
          </select>
          <select v-if="typeof binding.value === 'boolean'" class="input" :value="String(binding.value)" :aria-label="tr('value')" @change="set(String(key), { source: 'literal', value: ($event.target as HTMLSelectElement).value === 'true' })">
            <option value="true">
              {{ tr('yes') }}
            </option><option value="false">
              {{ tr('no') }}
            </option>
          </select>
          <input v-else class="input" :type="typeof binding.value === 'number' ? 'number' : 'text'" :value="binding.value" :aria-label="tr('value')" @input="set(String(key), { source: 'literal', value: scalar(($event.target as HTMLInputElement).value, typeof binding.value) })">
        </template>
      </div>
      <button v-if="!fixed" class="btn btn-icon remove-field" :aria-label="tr('removeField')" @click="remove(String(key))">
        ×
      </button>
    </div>
    <button v-if="!fixed" class="btn btn-quiet" @click="add">
      ＋ {{ tr('addField') }}
    </button>
    <p v-if="!Object.keys(modelValue).length && fixed" class="muted">
      {{ tr('noParameters') }}
    </p>
  </div>
</template>
