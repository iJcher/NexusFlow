<script setup lang="ts">
import type { IBindingOption } from './editor'
import type { IBinding, IExecutionSpec } from '@/types/execution-v2.types'
import { useI18n } from 'vue-i18n'
import BindingEditor from './BindingEditor.vue'

const props = defineProps<{
  channels: NonNullable<IExecutionSpec['state']>['channels']
  modelValue: Record<string, IBinding>
  options: IBindingOption[]
}>()
const emit = defineEmits<{
  'update:modelValue': [
        value: Record<string, IBinding>,
  ]
}>()
const { t } = useI18n()
function toggle(key: string, checked: boolean) {
  const next = { ...props.modelValue }
  if (checked)
    next[key] = props.options.find(option => option.binding.source === 'output' && !option.binding.path)?.binding || { source: 'literal', value: '' }
  else
    delete next[key]
  emit('update:modelValue', next)
}
</script>

<template>
  <div v-for="(channel, key) in channels" :key="key">
    <label class="checkbox-label"><input type="checkbox" :checked="!!modelValue[key]" @change="toggle(key, ($event.target as HTMLInputElement).checked)">{{ channel.schema.title || key }}</label>
    <BindingEditor v-if="modelValue[key]" :model-value="{ [key]: modelValue[key] }" :options="options" :schema="{ properties: { [key]: channel.schema } }" fixed @update:model-value="emit('update:modelValue', { ...modelValue, ...$event })" />
  </div>
  <p v-if="!Object.keys(channels).length" class="muted">
    {{ t('product.noSharedFields') }}
  </p>
</template>
