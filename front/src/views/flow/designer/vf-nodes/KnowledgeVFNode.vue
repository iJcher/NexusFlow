<template>
  <VueFlowNodeWrapper v-bind="props" :widget="KnowledgeNodeWidget" />
</template>

<script setup lang="ts">
import VueFlowNodeWrapper from '../components/VueFlowNodeWrapper.vue'
import KnowledgeNodeWidget from '../widgets/KnowledgeNodeWidget.vue'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()
</script>
