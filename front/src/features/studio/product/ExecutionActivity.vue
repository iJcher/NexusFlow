<script setup lang="ts">
import type { IExecutionActivity } from './activityProjection'
import type { IExecutionSpec, IRunView, IVersion } from '@/types/execution-v2.types'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { allNodes, nodeLabel } from './editor'
import InvocationTree from './InvocationTree.vue'

const props = defineProps<{ entries: IExecutionActivity[], view: IRunView, versions: IVersion[], spec: IExecutionSpec, name: string }>()
const { t, te } = useI18n()
const tr = (key: string) => t(`product.${key}`)
const active = computed(() => !['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'NEEDS_ATTENTION', 'REJECTED'].includes(props.view.status))
const visible = computed(() => props.entries.slice(-8))
const current = computed(() => [...props.entries].reverse().find(item => item.status === 'RUNNING'))
function label(item: IExecutionActivity) {
  if (item.phase === 'summary')
    return tr('contextSummarizing')
  if (item.phase === 'memory')
    return tr('memoryOrganizing')
  if (item.displayName)
    return te(`product.${item.displayName}`) ? tr(item.displayName) : item.displayName
  const invocation = props.view.invocations.find(value => value.id === item.invocation)
  const version = props.versions.find(value => value.id === invocation?.version_id)
  if (version)
    return version.name || tr(version.spec.kind)
  const parent = props.view.invocations.find(value => value.id === invocation?.parent_id)
  const scope = props.versions.find(value => value.id === parent?.version_id)?.spec || props.spec
  const node = allNodes(scope).find(value => value.id === item.node)
  return node ? nodeLabel(node, props.versions, tr) : item.kind === 'tool' ? tr(item.node) : props.name
}
function action(item: IExecutionActivity) {
  return tr(item.status === 'WAITING' ? 'activityWaiting' : item.status === 'FAILED' ? 'activityFailed' : item.status === 'CANCELLED' ? 'activityStopped' : item.status === 'RETURNED' ? 'activityReturned' : item.kind === 'model' ? 'modelThinking' : item.kind === 'tool' ? 'toolExecuting' : 'stepExecuting')
}
const headline = computed(() => props.view.status === 'WAITING' ? tr('activityWaiting') : !active.value ? tr(`statuses.${props.view.status}`) : current.value ? `${action(current.value)} · ${label(current.value)}` : tr('preparingRun'))
defineExpose({ headline })
</script>

<template>
  <section class="execution-activity" data-testid="execution-activity">
    <header class="activity-headline">
      <span v-if="active && view.status !== 'WAITING'" class="activity-spinner" aria-hidden="true" />
      <span v-else aria-hidden="true">{{ view.status === 'SUCCEEDED' ? '✓' : view.status === 'WAITING' ? '◇' : '·' }}</span><strong data-testid="activity-headline">{{ headline }}</strong>
    </header>
    <details :open="active" class="activity-steps">
      <summary>{{ tr(active ? 'liveActivity' : 'activityHistory') }}<span class="muted">{{ entries.length }}</span></summary>
      <ol :aria-label="tr('liveActivity')">
        <li v-for="item in visible" :key="item.id" :data-activity-kind="item.kind" :data-activity-status="item.status">
          <span class="activity-symbol" :class="{ 'activity-symbol--running': item.status === 'RUNNING' && active }">{{ item.status === 'RETURNED' ? '✓' : item.status === 'FAILED' ? '!' : item.kind === 'model' ? '✳' : '⌘' }}</span><span>{{ label(item) }}</span><small>{{ action(item) }}</small>
        </li>
      </ol>
      <p v-if="entries.length > visible.length" class="muted activity-earlier">
        {{ tr('earlierActivity') }}
      </p>
    </details>
    <details class="activity-tree">
      <summary>{{ tr('invocationTree') }}</summary><InvocationTree :invocations="view.invocations" :versions="versions" :spec="spec" :root-name="name" />
    </details>
  </section>
</template>
