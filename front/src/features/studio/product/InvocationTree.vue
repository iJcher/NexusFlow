<script setup lang="ts">
import type { IExecutionSpec, IInvocation, IVersion } from '@/types/execution-v2.types'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { allNodes, nodeLabel } from './editor'
import ResultView from './ResultView.vue'

const props = defineProps<{
  invocations: IInvocation[]
  versions: IVersion[]
  spec: IExecutionSpec
  parent?: string
  rootName?: string
}>()
const { t } = useI18n()
const tr = (key: string) => t(`product.${key}`)
const rows = computed(() => props.invocations.filter(item => props.parent ? item.parent_id === props.parent : !item.parent_id || !props.invocations.some(parent => parent.id === item.parent_id)))
function version(item: IInvocation) {
  return props.versions.find(value => value.id === item.version_id)
}
function title(item: IInvocation) {
  if (!item.parent_id && props.rootName)
    return props.rootName
  const published = version(item)
  if (published)
    return published.name
  const parent = props.invocations.find(value => value.id === item.parent_id)
  const scope = parent ? version(parent)?.spec || props.spec : props.spec
  const node = allNodes(scope).find(value => value.id === item.node_id)
  return node ? nodeLabel(node, props.versions, tr) : item.kind === 'tool' ? tr(item.node_id) : tr(item.kind === 'workflow' ? 'workflow' : 'agent')
}
</script>

<template>
  <ol class="product-process invocation-tree" :aria-label="parent ? undefined : tr('invocationTree')">
    <li v-for="item in rows" :key="item.id" :data-invocation-kind="item.kind">
      <span class="process-marker" :class="{ done: item.status === 'SUCCEEDED' }">{{ item.status === 'SUCCEEDED' ? '✓' : '·' }}</span><div>
        <strong>{{ title(item) }}</strong><span v-if="version(item)" class="tiny-badge">v{{ version(item)!.ordinal }}</span><small>{{ item.status === 'SUCCEEDED' ? tr('stepReturned') : tr(`statuses.${item.status}`) }}</small>
        <details v-if="item.output">
          <summary>{{ tr('diagnostics') }}</summary><ResultView :value="item.output" />
        </details>
        <details v-if="invocations.some(child => child.parent_id === item.id)" class="invocation-children" :open="item.status !== 'SUCCEEDED'">
          <summary>{{ tr('subExecution') }}</summary><InvocationTree :invocations="invocations" :versions="versions" :spec="spec" :parent="item.id" />
        </details>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.invocation-tree .invocation-tree {
  padding: var(--space-3) 0 0 var(--space-2);
  border-left: 1px solid var(--color-border-default);
  margin: var(--space-2) 0 0;
}
.invocation-tree:empty {
  display: none;
}
.invocation-tree li > div {
  min-width: 0;
  flex: 1;
}
.tiny-badge {
  margin-left: var(--space-2);
}
</style>
