<template>
  <VueFlowNodeWrapper v-bind="props" :widget="LLMNodeWidget" />
</template>

<script setup lang="ts">
import VueFlowNodeWrapper from '../components/VueFlowNodeWrapper.vue'
import LLMNodeWidget from '../widgets/LLMNodeWidget.vue'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()
</script>
