<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ kind: 'agent' | 'workflow' }>()
const { t } = useI18n()
const tr = (key: string) => t(`product.${key}`)
const host = ref<HTMLElement>()
const ratio = ref(55)
const mode = ref<'both' | 'configuration' | 'preview'>('both')
const mobile = ref<'configuration' | 'preview'>('configuration')
function initial() {
  try {
    const saved = Number(localStorage.getItem(`nf-split-${props.kind}`))
    ratio.value = saved >= 25 && saved <= 75 ? saved : props.kind === 'workflow' ? 65 : 50
  }
  catch { ratio.value = props.kind === 'workflow' ? 65 : 50 }
}
watch(() => props.kind, initial, { immediate: true })
function change(value: number) {
  const width = host.value?.clientWidth || 1200
  const min = Math.max(25, 320 / width * 100)
  ratio.value = Math.min(100 - min, Math.max(min, value))
  try {
    localStorage.setItem(`nf-split-${props.kind}`, String(ratio.value))
  }
  catch { /* Layout still works when browser storage is disabled. */ }
}
function move(event: PointerEvent) {
  const box = host.value?.getBoundingClientRect()
  if (box)
    change((event.clientX - box.left) / box.width * 100)
}
function stop() {
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', stop)
  document.body.classList.remove('resizing-workbench')
}
function start(event: PointerEvent) {
  if (event.button !== 0)
    return
  event.preventDefault()
  document.body.classList.add('resizing-workbench')
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop, { once: true })
}
function keyboard(event: KeyboardEvent) {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    change(event.key === 'Home' ? 25 : event.key === 'End' ? 75 : ratio.value + (event.key === 'ArrowLeft' ? -2 : 2))
  }
}
function reset() {
  change(props.kind === 'workflow' ? 65 : 50)
  mode.value = 'both'
}
const columns = computed(() => mode.value === 'both' ? `${ratio.value}fr 8px ${100 - ratio.value}fr` : 'minmax(0,1fr)')
onBeforeUnmount(stop)
</script>

<template>
  <div class="workbench-layout">
    <div class="workbench-tools">
      <div class="mobile-workbench-tabs">
        <button class="btn btn-quiet" :aria-pressed="mobile === 'configuration'" @click="mobile = 'configuration'">
          {{ tr('configure') }}
        </button>
        <button class="btn btn-quiet" :aria-pressed="mobile === 'preview'" @click="mobile = 'preview'">
          {{ tr('preview') }}
        </button>
      </div>
      <span class="muted desktop-layout-hint">{{ tr('splitHint') }}</span>
      <button class="btn btn-quiet desktop-layout-control" @click="mode = mode === 'configuration' ? 'both' : 'configuration'">
        {{ tr(mode === 'configuration' ? 'showPreview' : 'hidePreview') }}
      </button>
      <button class="btn btn-quiet desktop-layout-control" @click="mode = mode === 'preview' ? 'both' : 'preview'">
        {{ tr(mode === 'preview' ? 'backToEdit' : 'expandPreview') }}
      </button>
      <button class="btn btn-quiet desktop-layout-control" @click="reset">
        {{ tr('resetLayout') }}
      </button>
    </div>
    <div ref="host" class="product-workbench" :class="[`split-mode--${mode}`, `split-mobile--${mobile}`]" :style="{ gridTemplateColumns: columns }">
      <div v-show="mode !== 'preview'" class="split-configuration">
        <slot name="configuration" />
      </div>
      <div v-show="mode === 'both'" class="workbench-separator" role="separator" tabindex="0" aria-orientation="vertical" :aria-label="tr('resizePanels')" :aria-valuenow="Math.round(ratio)" :aria-valuemin="25" :aria-valuemax="75" @pointerdown="start" @keydown="keyboard" @dblclick="reset">
        <span />
      </div>
      <div v-show="mode !== 'configuration'" class="split-preview">
        <slot name="preview" />
      </div>
    </div>
  </div>
</template>
