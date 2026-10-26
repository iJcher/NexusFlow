<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  title: string
  wide?: boolean
}>()
const emit = defineEmits<{
  close: [
  ]
}>()
const { t } = useI18n()
const panel = ref<HTMLElement | null>(null)
let previous: HTMLElement | null = null
let surface: HTMLElement | null = null
let wasInert = false
const oldOverflow = document.body.style.overflow
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
  if (event.key !== 'Tab')
    return
  const nodes = Array.from(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]') || []).filter(item => item.getClientRects().length > 0)
  const first = nodes[0]
  const last = nodes.at(-1)
  if (!first) {
    event.preventDefault()
    panel.value?.focus()
  }
  else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
onMounted(async () => {
  previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  surface = document.querySelector<HTMLElement>('[data-app-surface]')
  if (surface) {
    wasInert = surface.inert
    surface.inert = true
  }
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', keyboard)
  await nextTick()
  panel.value?.querySelector<HTMLElement>('input,textarea,select,button')?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', keyboard)
  document.body.style.overflow = oldOverflow
  if (surface)
    surface.inert = wasInert
  previous?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="product-modal-backdrop" @mousedown.self="emit('close')">
      <section ref="panel" class="product-modal" :class="{ 'product-modal--wide': wide }" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
        <header>
          <h2>{{ title }}</h2><button class="btn btn-icon" :aria-label="t('product.close')" @click="emit('close')">
            ×
          </button>
        </header>
        <div class="product-modal-body">
          <slot />
        </div>
        <footer v-if="$slots.footer">
          <slot name="footer" />
        </footer>
      </section>
    </div>
  </Teleport>
</template>
