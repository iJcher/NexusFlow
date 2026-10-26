import { ref } from 'vue'

export interface IToast {
  id: number
  message: string
  kind: 'error' | 'success' | 'info'
}
export const toasts = ref<IToast[]>([])
let nextId = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()
export function dismissToast(id: number) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  toasts.value = toasts.value.filter(item => item.id !== id)
}
export function toast(message: string, kind: IToast['kind'] = 'error') {
  const existing = toasts.value.find(item => item.message === message)
  if (existing)
    dismissToast(existing.id)
  if (toasts.value.length >= 3)
    dismissToast(toasts.value[0].id)
  const id = ++nextId
  toasts.value.push({ id, message, kind })
  timers.set(id, setTimeout(dismissToast, kind === 'error' ? 12000 : 5000, id))
}
