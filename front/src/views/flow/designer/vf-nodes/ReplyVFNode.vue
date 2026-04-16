<template>
  <VueFlowNodeWrapper v-bind="props" :widget="ReplyNodeWidget" />
</template>

<script setup lang="ts">
import VueFlowNodeWrapper from '../components/VueFlowNodeWrapper.vue'
import ReplyNodeWidget from '../widgets/ReplyNodeWidget.vue'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()
</script>
