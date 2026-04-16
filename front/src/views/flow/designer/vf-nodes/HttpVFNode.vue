<template>
  <VueFlowNodeWrapper v-bind="props" :widget="HttpNodeWidget" />
</template>

<script setup lang="ts">
import VueFlowNodeWrapper from '../components/VueFlowNodeWrapper.vue'
import HttpNodeWidget from '../widgets/HttpNodeWidget.vue'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()
</script>
