<template>
  <VueFlowNodeWrapper v-bind="props" :widget="ResultNodeWidget" />
</template>

<script setup lang="ts">
import VueFlowNodeWrapper from '../components/VueFlowNodeWrapper.vue'
import ResultNodeWidget from '../widgets/ResultNodeWidget.vue'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()
</script>
