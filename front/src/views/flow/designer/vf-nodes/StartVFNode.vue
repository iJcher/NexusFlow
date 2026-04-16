<template>
  <VueFlowNodeWrapper v-bind="props" :widget="StartNodeWidget" />
</template>

<script setup lang="ts">
import VueFlowNodeWrapper from '../components/VueFlowNodeWrapper.vue'
import StartNodeWidget from '../widgets/StartNodeWidget.vue'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()
</script>
