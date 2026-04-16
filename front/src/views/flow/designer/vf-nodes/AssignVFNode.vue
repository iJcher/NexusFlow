<template>
  <VueFlowNodeWrapper v-bind="props" :widget="AssignNodeWidget" />
</template>

<script setup lang="ts">
import VueFlowNodeWrapper from '../components/VueFlowNodeWrapper.vue'
import AssignNodeWidget from '../widgets/AssignNodeWidget.vue'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()
</script>
