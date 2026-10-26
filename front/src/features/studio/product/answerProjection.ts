import type { IExecutionEvent } from '@/types/execution-v2.types'
import { ref } from 'vue'

export interface IAnswerMessage {
  id: string
  invocation: string
  attempt: string
  ordinal: number
  fields: Record<string, string>
  status: string
}
export function useAnswerProjection() {
  const messages = ref<IAnswerMessage[]>([])
  const trimmed = ref(false)
  function clear() {
    messages.value = []
    trimmed.value = false
  }
  function accept(event: IExecutionEvent) {
    if (!event.type.startsWith('answer.') || typeof event.data.messageId !== 'string')
      return
    const id = event.data.messageId
    let message = messages.value.find(item => item.id === id)
    if (!message) {
      message = { id, invocation: event.invocationId || '', attempt: event.attemptId, ordinal: -1, fields: {}, status: 'GENERATING' }
      messages.value.push(message)
    }
    const ordinal = Number(event.data.ordinal)
    if (!Number.isInteger(ordinal) || ordinal <= message.ordinal)
      return
    message.ordinal = ordinal
    if (event.type === 'answer.delta') {
      const fields = event.data.fields
      if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
        for (const [key, value] of Object.entries(fields)) {
          if (typeof value === 'string') {
            message.fields[key] = value.slice(0, 65536)
            if (value.length > 65536)
              trimmed.value = true
          }
        }
      }
    }
    if (event.type === 'answer.end')
      message.status = String(event.data.status || 'INTERRUPTED')
    while (messages.value.length > 64 || messages.value.reduce((sum, item) => sum + Object.values(item.fields).reduce((size, text) => size + text.length, 0), 0) > 524288) {
      messages.value.shift()
      trimmed.value = true
    }
  }
  return { messages, trimmed, accept, clear }
}
