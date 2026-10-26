<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ExecutionService as api } from '@/services/v2/execution.service'
import ProductModal from './ProductModal.vue'
import { toast } from './toasts'

const props = defineProps<{ definitionId: string }>()
const emit = defineEmits<{ close: [] }>()
const { t, te } = useI18n()
const tr = (key: string) => t(`product.${key}`)
const items = ref<Awaited<ReturnType<typeof api.memories>>>([])
const busy = ref(false)
async function action(work: () => Promise<void>) {
  if (busy.value)
    return
  busy.value = true
  try {
    await work()
  }
  catch (error) {
    const code = error instanceof Error ? error.message.split(' ·')[0] : ''
    toast(te(`product.errors.${code}`) ? tr(`errors.${code}`) : tr('errors.operationFailed'))
  }
  finally { busy.value = false }
}
async function refresh() {
  items.value = await api.memories(props.definitionId)
}
async function remove(id: string) {
  await action(async () => {
    await api.deleteMemory(props.definitionId, id)
    await refresh()
    toast(tr('memoryRemoved'), 'info')
  })
}
onMounted(() => {
  void action(refresh)
})
</script>

<template>
  <ProductModal :title="tr('longTermMemory')" @close="emit('close')">
    <p class="muted">
      {{ tr('memoryHint') }}
    </p>
    <p v-if="!items.length" class="muted">
      {{ tr('memoryEmpty') }}
    </p>
    <article v-for="item in items" :key="item.id" class="memory-entry">
      <p>{{ item.content }}</p>
      <div>
        <small class="muted">{{ tr(item.source === 'user_observed' ? 'memoryAuto' : item.source === 'user_explicit' ? 'memoryUser' : 'memoryTool') }}</small><button class="btn btn-quiet" :disabled="busy" @click="remove(item.id)">
          {{ tr('forgetMemory') }}
        </button>
      </div>
    </article>
    <p class="muted">
      {{ tr('memoryDeleteHint') }}
    </p>
  </ProductModal>
</template>

<style scoped>
.memory-entry {
  border-top: 1px solid var(--color-border);
  padding: 12px 0;
}
.memory-entry p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.memory-entry > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
