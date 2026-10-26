<script setup lang="ts">
import type { Edge, Node, NodeDragEvent } from '@vue-flow/core'
import type { IExecutionNode, IExecutionSequence, IExecutionSpec, IVersion } from '@/types/execution-v2.types'
import { Handle, MarkerType, Position, useVueFlow, VueFlow } from '@vue-flow/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { nodeLabel, uid } from './editor'

const props = defineProps<{
  spec: IExecutionSpec
  versions: IVersion[]
  positions: Record<string, {
    x: number
    y: number
  }>
  selected: string
}>()
const emit = defineEmits<{
  select: [
        id: string,
  ]
  add: [
        sequence: string,
  ]
  drag: [
        event: NodeDragEvent,
  ]
}>()
const { t } = useI18n()
const tr = (key: string) => t(`product.${key}`)
const canvasId = uid('canvas')
const container = ref<HTMLElement | null>(null)
let resizing: ResizeObserver | undefined
let fitTimer: ReturnType<typeof setTimeout> | undefined
const { fitView, onNodesInitialized } = useVueFlow({ id: canvasId })
function fit() {
  clearTimeout(fitTimer)
  fitTimer = setTimeout(() => {
    void fitView({ padding: 0.18, maxZoom: 1 })
  }, 100)
}
onMounted(() => {
  resizing = new ResizeObserver(fit)
  if (container.value)
    resizing.observe(container.value)
})
onBeforeUnmount(() => {
  resizing?.disconnect()
  clearTimeout(fitTimer)
})
function nested(node: IExecutionNode) {
  return node.branches || [...(node.cases || []).map(item => item.body), ...(node.default ? [node.default] : [])]
}
function width(body: IExecutionSequence): number {
  return Math.max(250, ...body.steps.map(node => nested(node).reduce((sum, child) => sum + width(child) + 45, -45)))
}
const layout = computed(() => {
  const nodes: Node[] = []
  const edges: Edge[] = []
  function add(id: string, x: number, y: number, data: Record<string, unknown>) {
    nodes.push({ id, type: 'default', position: props.positions[id] || { x: x - 106, y }, data, draggable: data.kind !== 'insert' && data.kind !== 'path', connectable: false })
  }
  function connect(source: string, target: string) {
    if (source)
      edges.push({ id: `${source}:${target}`, source, target, type: 'smoothstep', markerEnd: MarkerType.ArrowClosed })
  }
  function render(body: IExecutionSequence, center: number, top: number, outer = false): {
    first: string
    last: string
    bottom: number
  } {
    let first = ''
    let previous = ''
    let y = top
    for (const node of body.steps) {
      if (outer && node.type === 'output') {
        const id = `ui_add_${body.id}`
        add(id, center, y, { kind: 'insert', sequence: body.id })
        connect(previous, id)
        previous = id
        y += 94
      }
      add(node.id, center, y, { kind: node.type, label: nodeLabel(node, props.versions, tr), owner: node.id })
      connect(previous, node.id)
      if (!first)
        first = node.id
      previous = node.id
      y += 118
      const branches = nested(node)
      if (branches.length) {
        const total = branches.reduce((sum, child) => sum + width(child) + 45, -45)
        let offset = center - total / 2
        let bottom = y
        const ends: string[] = []
        branches.forEach((branch, index) => {
          const branchCenter = offset + width(branch) / 2
          const header = `ui_path_${branch.id}`
          const label = node.type === 'parallel' ? `${tr('parallelPath')} ${index + 1}` : index === branches.length - 1 ? tr('otherwise') : `${tr('conditionMatches')} ${index + 1}`
          add(header, branchCenter, y, { kind: 'path', label })
          connect(node.id, header)
          const rendered = render(branch, branchCenter, y + 76)
          connect(header, rendered.first)
          ends.push(rendered.last)
          bottom = Math.max(bottom, rendered.bottom)
          offset += width(branch) + 45
        })
        const join = `ui_join_${node.id}`
        add(join, center, bottom + 20, { kind: 'join', owner: node.id, label: tr(node.type === 'parallel' ? 'join' : 'branchContinue') })
        ends.forEach(end => connect(end, join))
        previous = join
        y = bottom + 126
      }
    }
    if (!outer) {
      const id = `ui_add_${body.id}`
      add(id, center, y, { kind: 'insert', sequence: body.id })
      connect(previous, id)
      if (!first)
        first = id
      previous = id
      y += 92
    }
    return { first, last: previous, bottom: y }
  }
  if (props.spec.body)
    render(props.spec.body, width(props.spec.body) / 2, 40, true)
  return { nodes, edges }
})
onNodesInitialized(() => {
  void fitView({ padding: 0.18, maxZoom: 1 })
})
watch(() => layout.value.nodes.length, fit)
</script>

<template>
  <div ref="container" class="product-canvas" data-testid="workflow-canvas">
    <VueFlow :id="canvasId" :nodes="layout.nodes" :edges="layout.edges" :nodes-connectable="false" :min-zoom="0.2" :max-zoom="1.5" @node-drag-stop="emit('drag', $event)">
      <template #node-default="{ id, data }">
        <button class="product-flow-node" :class="[`product-flow-node--${data.kind}`, { selected: selected === data.owner }]" :data-node-id="data.owner || id" @click.stop="data.kind === 'insert' ? emit('add', String(data.sequence)) : data.owner ? emit('select', String(data.owner)) : undefined">
          <Handle type="target" :position="Position.Top" />
          <span v-if="data.kind === 'insert'">＋ {{ tr('addStep') }}</span>
          <template v-else>
            <span v-if="data.kind !== 'path' && data.kind !== 'join'" class="node-symbol" aria-hidden="true">{{ data.kind === 'agent_call' ? '✳' : data.kind === 'parallel' ? '⑂' : data.kind === 'branch' ? '◇' : data.kind === 'human' ? '✓' : data.kind === 'input' ? '↳' : '↗' }}</span><span><small v-if="data.kind !== 'path' && data.kind !== 'join'">{{ tr(`nodes.${data.kind}`) }}</small><strong>{{ data.label }}</strong></span>
          </template>
          <Handle type="source" :position="Position.Bottom" />
        </button>
      </template>
    </VueFlow>
    <button class="btn btn-secondary canvas-fit" :aria-label="tr('fitCanvas')" @click="fitView({ padding: .18, maxZoom: 1 })">
      ⊡
    </button>
  </div>
</template>
