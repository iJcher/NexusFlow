<script setup lang="ts">
import type { IBinding, IExecutionNode, IExecutionSpec, IToolDescriptor, IVersion } from '@/types/execution-v2.types'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BindingEditor from './BindingEditor.vue'
import { bindingOptions, nodeLabel, uid } from './editor'
import SchemaEditor from './SchemaEditor.vue'
import StateWrites from './StateWrites.vue'
import { toast } from './toasts'

const props = defineProps<{
  node: IExecutionNode
  spec: IExecutionSpec
  versions: IVersion[]
  tools: IToolDescriptor[]
}>()
const emit = defineEmits<{
  change: [
        node: IExecutionNode,
  ]
  schema: [
        kind: 'inputSchema' | 'outputSchema',
        value: Record<string, unknown>,
  ]
  selectAgent: [
  ]
  close: [
  ]
  remove: [
  ]
  move: [
        direction: number,
  ]
}>()
const { t } = useI18n()
const tr = (key: string) => t(`product.${key}`)
const options = computed(() => bindingOptions(props.spec, props.node, props.versions, tr).filter(option => props.node.type !== 'output' || option.schemaType === 'object'))
const writeOptions = computed(() => bindingOptions(props.spec, props.node, props.versions, tr, true))
const child = computed(() => props.versions.find(item => item.id === props.node.versionRef))
const targetSchema = computed(() => ['agent_call', 'workflow_call'].includes(props.node.type) ? child.value?.spec.inputSchema : props.node.type === 'human' ? { type: 'object', properties: Object.fromEntries(Object.keys(props.node.input || {}).map(key => [key, key === 'context' ? { title: tr('fields.context'), type: 'object' } : (props.spec.inputSchema.properties as Record<string, unknown> | undefined)?.[key] || {}])) } : props.node.type === 'tool' ? props.tools.find(item => item.name === props.node.toolRef)?.inputSchema : undefined)
function selectTool(name: string) {
  const schema = props.tools.find(item => item.name === name)?.inputSchema
  const properties = (schema?.properties || {}) as Record<string, Record<string, unknown>>
  patch({ toolRef: name, input: Object.fromEntries(Object.entries(properties).map(([key, field]) => [key, props.node.input?.[key] || { source: 'literal', value: Array.isArray(field.enum) ? field.enum[0] : '' }])) })
}
function patch(value: Partial<IExecutionNode>) {
  emit('change', { ...props.node, ...value })
}
function output(value: Record<string, IBinding>) {
  patch({ value: value.result })
}
function addPath() {
  const body = { id: uid('path'), type: 'sequence' as const, steps: [] }
  if (props.node.type === 'parallel')
    patch({ branches: [...(props.node.branches || []), body] })
  else
    patch({ cases: [...(props.node.cases || []), { when: { left: { source: 'input', path: '/request' }, operator: 'contains', right: '' }, body }] })
}
function removePath(index: number) {
  const body = props.node.type === 'parallel' ? props.node.branches?.[index] : props.node.cases?.[index].body
  if (body?.steps.length) {
    toast(tr('removePathContents'))
    return
  }
  if (props.node.type === 'parallel')
    patch({ branches: props.node.branches?.filter((_, position) => position !== index) })
  else
    patch({ cases: props.node.cases?.filter((_, position) => position !== index) })
}
</script>

<template>
  <aside class="product-node-config">
    <header>
      <div><small>{{ tr('configureStep') }}</small><h2>{{ nodeLabel(node, versions, tr) }}</h2></div><button class="btn btn-icon" :aria-label="tr('close')" @click="emit('close')">
        ×
      </button>
    </header>
    <div class="node-config-scroll">
      <label class="form__field">{{ tr('stepName') }}<input class="input" :value="node.label || ''" :placeholder="tr(`nodes.${node.type}`)" maxlength="80" @input="patch({ label: ($event.target as HTMLInputElement).value })"></label>
      <template v-if="node.type === 'input'">
        <p class="muted">
          {{ tr('startBoundary') }}
        </p><SchemaEditor :model-value="spec.inputSchema" @update:model-value="emit('schema', 'inputSchema', $event)" />
      </template>
      <template v-else-if="node.type === 'output'">
        <p class="muted">
          {{ tr('endBoundary') }}
        </p><BindingEditor :model-value="{ result: node.value || { source: 'input', path: '' } }" :options="options" fixed :allow-literal="false" @update:model-value="output" />
      </template>
      <template v-else>
        <button v-if="['agent_call', 'workflow_call'].includes(node.type)" class="resource-selection" @click="emit('selectAgent')">
          <span>✳ {{ child?.name || tr(node.type === 'workflow_call' ? 'selectWorkflow' : 'selectAgent') }}</span><small>{{ child ? `v${child.ordinal}` : tr('publishedRequired') }} ↗</small>
        </button>
        <label v-if="node.type === 'tool'" class="form__field">{{ tr('tools') }}<select class="input" :value="node.toolRef" @change="selectTool(($event.target as HTMLSelectElement).value)"><option v-for="tool in tools" :key="tool.name" :value="tool.name">{{ tr(tool.name) }}</option></select></label>
        <template v-if="node.type === 'human'">
          <label class="form__field">{{ tr('approvalTitle') }}<input class="input" :value="node.title" maxlength="120" @input="patch({ title: ($event.target as HTMLInputElement).value })"></label><label class="form__field">{{ tr('approvalPrompt') }}<textarea class="input" :value="node.prompt" rows="3" maxlength="2000" @input="patch({ prompt: ($event.target as HTMLTextAreaElement).value })" /></label>
        </template>
        <template v-if="node.type === 'branch'">
          <section v-for="(item, index) in node.cases" :key="item.body.id" class="condition-editor">
            <h3>{{ tr('branchRule') }} {{ index + 1 }}</h3>
            <button v-if="(node.cases?.length || 0) > 1" class="btn btn-quiet" @click="removePath(index)">
              {{ tr('removePath') }}
            </button>
            <BindingEditor :model-value="{ value: item.when.left }" :options="options" fixed @update:model-value="patch({ cases: node.cases?.map((entry, position) => position === index ? { ...entry, when: { ...entry.when, left: $event.value } } : entry) })" />
            <select class="input" :value="item.when.operator" :aria-label="tr('branchRule')" @change="patch({ cases: node.cases?.map((entry, position) => position === index ? { ...entry, when: { ...entry.when, operator: ($event.target as HTMLSelectElement).value } } : entry) })">
              <option v-for="operator in ['eq', 'ne', 'contains', 'gt', 'gte', 'lt', 'lte', 'exists']" :key="operator" :value="operator">
                {{ tr(`operators.${operator}`) }}
              </option>
            </select>
            <section v-if="item.when.operator !== 'exists'">
              <h3>{{ tr('ruleValue') }}</h3><BindingEditor :model-value="{ value: { source: 'literal', value: item.when.right } }" :options="[]" fixed @update:model-value="patch({ cases: node.cases?.map((entry, position) => position === index ? { ...entry, when: { ...entry.when, right: $event.value.value } } : entry) })" />
            </section>
          </section>
        </template>
        <template v-if="!['branch', 'parallel'].includes(node.type)">
          <h3>{{ tr(node.type === 'transform' ? 'resultMapping' : 'mapping') }}</h3><BindingEditor :model-value="node.input || {}" :options="options" :schema="targetSchema" :fixed="!!targetSchema" @update:model-value="patch({ input: $event })" />
        </template>
        <p v-else class="muted">
          {{ tr('editPathsOnCanvas') }}
        </p>
        <template v-if="node.type === 'parallel'">
          <div v-for="(_, index) in node.branches" :key="index" class="tool-row">
            <span>{{ tr('parallelPath') }} {{ index + 1 }}</span><button v-if="(node.branches?.length || 0) > 2" class="btn btn-quiet" @click="removePath(index)">
              {{ tr('removePath') }}
            </button>
          </div>
        </template>
        <button v-if="['parallel', 'branch'].includes(node.type) && (node.branches?.length || node.cases?.length || 0) < 4" class="btn btn-quiet" @click="addPath">
          ＋ {{ tr('addPath') }}
        </button>
        <details v-if="node.type === 'tool'" class="product-disclosure">
          <summary>{{ tr('more') }}</summary><label class="form__field">{{ tr('retryAttempts') }}<input class="input" type="number" min="1" max="3" :value="node.retry?.maxAttempts || 1" @input="patch({ retry: { maxAttempts: Number(($event.target as HTMLInputElement).value) } })"></label><label class="form__field">{{ tr('failurePolicy') }}<select class="input" :value="node.onError || 'fail'" @change="patch({ onError: ($event.target as HTMLSelectElement).value })"><option value="fail">{{ tr('fail') }}</option><option value="continue">{{ tr('continue') }}</option></select></label>
        </details>
      </template>
      <details v-if="node.type !== 'output'" class="product-disclosure">
        <summary>{{ tr('stateWrites') }}</summary><StateWrites :model-value="node.write || {}" :channels="spec.state?.channels || {}" :options="writeOptions" @update:model-value="patch({ write: $event })" /><p class="muted">
          {{ tr('stateWriteHint') }}
        </p>
      </details>
    </div>
    <footer v-if="!['input', 'output'].includes(node.type)">
      <button class="btn btn-quiet" @click="emit('move', -1)">
        ↑ {{ tr('moveUp') }}
      </button><button class="btn btn-quiet" @click="emit('move', 1)">
        ↓ {{ tr('moveDown') }}
      </button><button class="btn btn-danger" @click="emit('remove')">
        {{ tr('removeStep') }}
      </button>
    </footer>
  </aside>
</template>
