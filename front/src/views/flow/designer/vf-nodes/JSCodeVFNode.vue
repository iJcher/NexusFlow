<template>
  <VueFlowNodeWrapper v-bind="props" :widget="JSCodeNodeWidget" />
</template>

<script setup lang="ts">
import VueFlowNodeWrapper from '../components/VueFlowNodeWrapper.vue'
import JSCodeNodeWidget from '../widgets/JSCodeNodeWidget.vue'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()
</script>
