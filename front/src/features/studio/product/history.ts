import type { Ref } from 'vue'
import type { IDefinition } from '@/types/execution-v2.types'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { signature } from './editor'
// Local editing history only. Published versions and execution checkpoints remain immutable.
export function useDraftHistory(selected: Ref<IDefinition | null>) {
  const entries: string[] = []
  let index = -1
  let applying = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const historyVersion = ref(0)
  function capture() {
    clearTimeout(timer)
    const value = signature(selected.value)
    if (!selected.value || entries[index] === value)
      return
    entries.splice(index + 1)
    entries.push(value)
    if (entries.length > 40)
      entries.shift()
    index = entries.length - 1
    historyVersion.value++
  }
  // Include a reactive revision so computed buttons observe changes to the bounded plain array.
  watch(() => selected.value?.id, () => {
    clearTimeout(timer)
    entries.splice(0)
    index = -1
    capture()
  }, { flush: 'sync' })
  watch(() => signature(selected.value), () => {
    if (applying)
      return
    clearTimeout(timer)
    timer = setTimeout(capture, 450)
  }, { flush: 'sync' })
  function restore(position: number) {
    const target = selected.value
    if (!target || position < 0 || position >= entries.length)
      return
    applying = true
    try {
      const snapshot = JSON.parse(entries[position]) as Pick<IDefinition, 'name' | 'spec' | 'editor'>
      target.name = snapshot.name
      target.spec = snapshot.spec
      target.editor = snapshot.editor
      index = position
      historyVersion.value++
    }
    finally {
      applying = false
    }
  }
  function undo() {
    capture()
    restore(index - 1)
  }
  function redo() {
    clearTimeout(timer)
    restore(index + 1)
  }
  onBeforeUnmount(() => clearTimeout(timer))
  return { undo, redo, recordHistory: capture, canUndo: computed(() => {
    void historyVersion.value
    return !!selected.value && (index > 0 || signature(selected.value) !== entries[index])
  }), canRedo: computed(() => {
    void historyVersion.value
    return !!selected.value && index < entries.length - 1
  }) }
}
