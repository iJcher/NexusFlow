<script setup lang="ts">
import type { IExecutionSpec } from '@/types/execution-v2.types'
import { useI18n } from 'vue-i18n'
import { uid } from './editor'

type Channels = NonNullable<IExecutionSpec['state']>['channels']
const props = defineProps<{
  modelValue: Channels
}>()
const emit = defineEmits<{
  'update:modelValue': [
        value: Channels,
  ]
}>()
const { t } = useI18n()
const tr = (key: string) => t(`product.${key}`)
function change(key: string, field: string, value: string) {
  const channel = props.modelValue[key]
  const next = field === 'type'
    ? { schema: { title: channel.schema.title, type: value === 'collection' ? 'object' : value }, reducer: value === 'collection' ? 'collect_by_id_v1' : 'last_value' }
    : { ...channel, schema: { ...channel.schema, title: value } }
  emit('update:modelValue', { ...props.modelValue, [key]: next })
}
function remove(key: string) {
  const next = { ...props.modelValue }
  delete next[key]
  emit('update:modelValue', next)
}
function add() {
  emit('update:modelValue', { ...props.modelValue, [uid('data')]: { schema: { type: 'string', title: tr('newField') }, reducer: 'last_value' } })
}
</script>

<template>
  <div class="schema-editor">
    <div v-for="(channel, key) in modelValue" :key="key" class="schema-field-row">
      <input class="input" :aria-label="tr('fieldName')" :value="channel.schema.title || key" @input="change(key, 'title', ($event.target as HTMLInputElement).value)">
      <select class="input" :aria-label="tr('fieldType')" :value="channel.reducer === 'collect_by_id_v1' ? 'collection' : channel.schema.type" @change="change(key, 'type', ($event.target as HTMLSelectElement).value)">
        <option v-for="type in ['string', 'number', 'boolean', 'collection']" :key="type" :value="type">
          {{ tr(`types.${type}`) }}
        </option>
      </select>
      <span class="muted">{{ tr(channel.reducer === 'collect_by_id_v1' ? 'collectResults' : 'singleWriter') }}</span>
      <button class="btn btn-icon" :aria-label="tr('removeField')" @click="remove(key)">
        ×
      </button>
    </div>
    <button class="btn btn-quiet" @click="add">
      ＋ {{ tr('addField') }}
    </button>
    <p class="muted">
      {{ tr('statePolicy') }}
    </p>
  </div>
</template>
