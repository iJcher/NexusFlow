import type { IExecutionEvent } from '@/types/execution-v2.types'
import { ref } from 'vue'

export interface IExecutionActivity {
  id: string
  invocation: string
  node: string
  displayName?: string
  phase?: string
  kind: 'model' | 'tool' | 'task'
  status: 'RUNNING' | 'WAITING' | 'RETURNED' | 'FAILED' | 'CANCELLED'
  seq: number
}
export function useActivityProjection() {
  const entries = ref<IExecutionActivity[]>([])
  function clear() {
    entries.value = []
  }
  function accept(event: IExecutionEvent) {
    const type = event.type
    if (['run.waiting', 'run.resumed', 'run.failed', 'run.completed'].includes(type)) {
      for (const item of entries.value) {
        if (['RUNNING', 'WAITING'].includes(item.status)) {
          item.status = type === 'run.waiting' ? 'WAITING' : type === 'run.resumed' ? 'RUNNING' : type === 'run.completed' ? 'RETURNED' : event.data.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED'
        }
      }
      return
    }
    if (!event.invocationId || !/^(?:agent\.model|node|agent|tool|invocation)\.(?:started|completed|failed|reused|retrying)$/.test(type))
      return
    const model = type.startsWith('agent.model.')
    const id = model ? `model:${String(event.data.decisionId || `${event.invocationId}:${event.seq}`)}` : `task:${event.invocationId}`
    let item = entries.value.find(entry => entry.id === id)
    if (!item) {
      item = { id, invocation: event.invocationId, node: event.nodeId || '', kind: model ? 'model' : type.startsWith('tool.') ? 'tool' : 'task', status: 'RUNNING', seq: event.seq }
      entries.value.push(item)
    }
    if (type.startsWith('tool.'))
      item.kind = 'tool'
    if (typeof event.data.displayName === 'string')
      item.displayName = event.data.displayName
    if (typeof event.data.phase === 'string')
      item.phase = event.data.phase
    item.status = type.endsWith('completed') || type.endsWith('reused') ? 'RETURNED' : type.endsWith('failed') ? 'FAILED' : 'RUNNING'
    // Keep public metadata only: no prompts, arguments, raw tool output or hidden reasoning.
    while (entries.value.length > 256) {
      const completed = entries.value.findIndex(entry => !['RUNNING', 'WAITING'].includes(entry.status))
      entries.value.splice(completed >= 0 ? completed : 0, 1)
    }
  }
  return { entries, accept, clear }
}
