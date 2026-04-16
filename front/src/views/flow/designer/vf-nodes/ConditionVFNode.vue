<template>
  <VueFlowNodeWrapper v-bind="props" :widget="ConditionNodeWidget" />
</template>

<script setup lang="ts">
import VueFlowNodeWrapper from '../components/VueFlowNodeWrapper.vue'
import ConditionNodeWidget from '../widgets/ConditionNodeWidget.vue'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()
</script>
