<script setup lang="ts">
import type { Node, NodeDragEvent } from '@vue-flow/core'
import type { IBinding, ICapabilities, IDefinition, IExecutionEvent, IExecutionNode, IExecutionSpec, IInvocation, IRunView, IVersion } from '@/types/execution-v2.types'
import { Handle, MarkerType, Position, VueFlow } from '@vue-flow/core'
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ExecutionService as api, object } from '@/services/v2/execution.service'

const { t, locale } = useI18n()
const tr = (key: string) => t(`studio.${key}`)
function switchLocale() {
  locale.value = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN'
  localStorage.setItem('nf-studio-language', locale.value)
}
const authenticated = ref(false)
const username = ref('developer')
const password = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')
const definitions = ref<IDefinition[]>([])
const versions = ref<IVersion[]>([])
const capabilities = ref<ICapabilities | null>(null)
const selected = ref<IDefinition | null>(null)
const saved = ref('')
const selectedNodeId = ref('')
const inputMapping = ref('{}')
const writeMapping = ref('{}')
const outputMapping = ref('{}')
const inputSchemaText = ref('')
const outputSchemaText = ref('')
const schemaOpen = ref(false)
const settingsOpen = ref(false)
const collapsed = ref(false)
const mode = ref<'editor' | 'monitor'>('editor')
const runInput = ref('')
const runId = ref(new URLSearchParams(location.search).get('run') || '')
const run = ref<IRunView | null>(null)
const events = ref<IExecutionEvent[]>([])
const connected = ref(false)
function invocationStatus(item: IInvocation) {
  if (!item.parent_id)
    return run.value?.status || item.status
  if (item.status !== 'SUCCEEDED')
    return item.status
  if (item.kind === 'tool')
    return tr('toolResultReady')
  const snapshot = [...events.value].reverse().find(event => event.type === 'checkpoint.committed')
  const completed = snapshot?.data.completedNodeIds
  if (Array.isArray(completed) && completed.includes(item.node_id))
    return tr('graphCommitted')
  return tr(run.value && ['FAILED', 'TIMED_OUT', 'NEEDS_ATTENTION'].includes(run.value.status) ? 'graphNotCommitted' : 'awaitingGraphCommit')
}
const details = ref<unknown>(null)
const publishedVersionId = ref('')
const mappingDirty = ref(false)
const schemaDirty = ref(false)
let observer: AbortController | null = null
const selectedNode = computed(() => selected.value?.spec.body?.steps.find(node => node.id === selectedNodeId.value))
const steps = computed(() => selected.value?.spec.body?.steps || [])
const signature = () => selected.value ? JSON.stringify({ name: selected.value.name, spec: selected.value.spec, editor: selected.value.editor }) : ''
const dirty = computed(() => signature() !== saved.value || mappingDirty.value || schemaDirty.value)
const agentVersions = computed(() => versions.value.filter(version => version.spec.kind === 'agent'))
const selectedAgentVersion = computed(() => agentVersions.value.find(version => version.id === selectedNode.value?.versionRef))
const ownVersions = computed(() => versions.value.filter(version => version.definitionId === selected.value?.id))
const finalStatuses = new Set(['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'NEEDS_ATTENTION', 'REJECTED'])
const pretty = (value: unknown) => JSON.stringify(value, null, 2)
function nodeTitle(node: IExecutionNode) {
  return node.type === 'agent_call' ? agentVersions.value.find(version => version.id === node.versionRef)?.name || tr('agent_call') : tr(node.type === 'tool' ? 'toolNode' : node.type)
}
const graphNodes = computed<Node[]>(() => steps.value.map((node, index) => ({ id: node.id, type: 'default', position: selected.value?.editor.positions?.[node.id] || { x: 160, y: 50 + index * 145 }, data: { label: nodeTitle(node), kind: node.type, index: index + 1 }, connectable: false })))
const graphEdges = computed(() => steps.value.slice(1).map((node, index) => ({ id: `${steps.value[index].id}:${node.id}`, source: steps.value[index].id, target: node.id, markerEnd: MarkerType.ArrowClosed, type: 'smoothstep' })))
function locationState() {
  const params = new URLSearchParams()
  if (selected.value)
    params.set('definition', selected.value.id)
  if (runId.value)
    params.set('run', runId.value)
  history.replaceState(null, '', `${location.pathname}?${params}`)
}
async function action(work: () => Promise<void>) {
  if (busy.value)
    return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await work()
  }
  catch (failure) {
    error.value = failure instanceof Error ? failure.message : tr('actionFailed')
  }
  finally {
    busy.value = false
  }
}
function choose(item: IDefinition, force = false, preserveRun = false) {
  if (dirty.value && !force) {
    error.value = tr('dirtySwitch')
    return
  }
  if (!preserveRun && selected.value?.id !== item.id) {
    observer?.abort()
    runId.value = ''
    run.value = null
    events.value = []
    details.value = null
    connected.value = false
  }
  selected.value = structuredClone(toRaw(item))
  selectedNodeId.value = ''
  schemaOpen.value = false
  mappingDirty.value = false
  schemaDirty.value = false
  inputSchemaText.value = pretty(item.spec.inputSchema)
  outputSchemaText.value = pretty(item.spec.outputSchema)
  saved.value = signature()
  mode.value = 'editor'
  publishedVersionId.value = ownVersions.value[0]?.id || ''
  runInput.value = pretty({ request: tr('defaultRequest') })
  locationState()
}
async function reload() {
  definitions.value = await api.definitions()
  versions.value = await api.versions()
  capabilities.value = await api.capabilities()
}
async function login() {
  await action(async () => {
    await api.login(username.value, password.value)
    password.value = ''
    authenticated.value = true
    await reload()
    await hydrateUrl()
  })
}
async function create(kind: 'workflow' | 'agent') {
  if (dirty.value) {
    error.value = tr('dirtySwitch')
    return
  }
  await action(async () => {
    const inputSchema = { type: 'object', properties: { request: { type: 'string', maxLength: 4000 } }, required: ['request'], additionalProperties: false }
    const outputSchema = { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false }
    const spec: IExecutionSpec = { dslVersion: '2.0', kind, definitionKey: `${kind}-${crypto.randomUUID().slice(0, 8)}`, inputSchema, outputSchema, budget: { maxModelCalls: 8, maxToolCalls: 12, maxTokens: 60000, timeoutSeconds: 120 } }
    if (kind === 'agent') {
      spec.agent = { prompt: tr('initialPrompt'), modelConnectionRef: 'fixture', tools: ['inspect_text'] }
    }
    else {
      spec.state = { channels: { request: { schema: { type: 'string' }, reducer: 'last_value' } } }
      spec.body = { type: 'sequence', id: 'main', steps: [{ id: 'input', type: 'input', write: { request: { source: 'input', path: '/request' } } }, { id: 'output', type: 'output', value: { source: 'node_output', nodeId: 'input', path: '' } }] }
    }
    const item = await api.create(tr(kind === 'agent' ? 'agentName' : 'workflowName'), spec)
    definitions.value.unshift(item)
    choose(item, true)
  })
}
async function save() {
  if (!selected.value)
    return
  if (mappingDirty.value && !applyMapping())
    throw new Error(tr('formatError'))
  if (schemaDirty.value && !applySchemas())
    throw new Error(tr('formatError'))
  if (!Object.values(selected.value.spec.budget).every(value => Number.isInteger(value) && value > 0))
    throw new Error(tr('invalidBudget'))
  if (selected.value.spec.agent && !selected.value.spec.agent.prompt.trim())
    throw new Error(tr('blankPrompt'))
  if (selected.value.spec.agent && !selected.value.spec.agent.tools.length)
    throw new Error(tr('emptyTools'))
  const item = await api.save(selected.value)
  selected.value.revision = item.revision
  definitions.value = definitions.value.map(old => old.id === item.id ? item : old)
  saved.value = signature()
  notice.value = tr('saved')
}
function focusNode(id: string) {
  if (mappingDirty.value && !applyMapping())
    return
  selectedNodeId.value = id
  const node = selectedNode.value
  inputMapping.value = pretty(node?.input || {})
  writeMapping.value = pretty(node?.write || {})
  outputMapping.value = pretty(node?.value || {})
}
function addNode(type: string) {
  if (mappingDirty.value && !applyMapping())
    return
  if (!selected.value?.spec.body || !capabilities.value?.nodes.find(node => node.type === type)?.enabled)
    return
  const id = `${type.replace('_', '-')}-${crypto.randomUUID().slice(0, 6)}`.replace(/-/g, '_')
  const node: IExecutionNode = { id, type }
  if (type === 'agent_call') {
    node.versionRef = agentVersions.value[0]?.id || ''
    node.input = { request: { source: 'state', path: '/request' } }
  }
  if (type === 'transform')
    node.input = { summary: { source: 'node_output', nodeId: steps.value.at(-2)?.id || 'input', path: '/summary' } }
  if (type === 'tool') {
    node.toolRef = 'inspect_text'
    node.input = { text: { source: 'input', path: '/request' } }
  }
  const body = selected.value.spec.body
  body.steps.splice(body.steps.length - 1, 0, node)
  body.steps.at(-1)!.value = { source: 'node_output', nodeId: id, path: '' }
  focusNode(id)
}
function bindings(node: IExecutionNode) {
  return [...Object.values(node.input || {}), ...Object.values(node.write || {}), ...(node.value ? [node.value] : [])]
}
function moveNode(direction: number) {
  const body = selected.value?.spec.body
  if (!body)
    return
  const index = body.steps.findIndex(node => node.id === selectedNodeId.value)
  const target = index + direction
  if (index <= 0 || index >= body.steps.length - 1 || target <= 0 || target >= body.steps.length - 1)
    return
  const next = [...body.steps];
  [next[index], next[target]] = [next[target], next[index]]
  const seen = new Set<string>()
  for (const node of next) {
    if (bindings(node).some(item => item.source === 'node_output' && !seen.has(item.nodeId || ''))) {
      error.value = tr('invalidMove')
      return
    }
    seen.add(node.id)
  }
  body.steps = next
}
function removeNode() {
  if (!selected.value?.spec.body || !selectedNode.value)
    return
  const node = selectedNode.value
  if (['input', 'output'].includes(node.type)) {
    error.value = tr('deleteBlocked')
    return
  }
  if (steps.value.some(other => other.id !== node.id && bindings(other).some(value => value.nodeId === node.id))) {
    error.value = tr('referenced')
    return
  }
  selected.value.spec.body.steps = steps.value.filter(other => other.id !== node.id)
  selectedNodeId.value = ''
}
function parseMapping(text: string): Record<string, IBinding> {
  const value = object(JSON.parse(text))
  const result: Record<string, IBinding> = {}
  for (const [key, raw] of Object.entries(value)) {
    const item = object(raw)
    if (!['input', 'state', 'node_output', 'output', 'literal'].includes(String(item.source)))
      throw new Error(tr('formatError'))
    result[key] = { source: String(item.source), ...(typeof item.path === 'string' ? { path: item.path } : {}), ...(typeof item.nodeId === 'string' ? { nodeId: item.nodeId } : {}), ...('value' in item ? { value: item.value } : {}), ...(typeof item.key === 'string' ? { key: item.key } : {}) }
  }
  return result
}
function applyMapping() {
  try {
    if (!selectedNode.value)
      return false
    const inputs = parseMapping(inputMapping.value)
    const writes = parseMapping(writeMapping.value)
    const result = selectedNode.value.type === 'output' ? parseMapping(pretty({ result: JSON.parse(outputMapping.value) })).result : undefined
    if (selectedNode.value.type !== 'output')
      selectedNode.value.input = inputs
    if (Object.keys(writes).length || selectedNode.value.write)
      selectedNode.value.write = writes
    if (result)
      selectedNode.value.value = result
    error.value = ''
    notice.value = tr('configUpdated')
    mappingDirty.value = false
    return true
  }
  catch {
    error.value = tr('formatError')
    return false
  }
}
function applySchemas() {
  try {
    if (!selected.value)
      return false
    const input = object(JSON.parse(inputSchemaText.value))
    const output = object(JSON.parse(outputSchemaText.value))
    if (input.type !== 'object' || output.type !== 'object')
      throw new Error('SCHEMA_OBJECT_REQUIRED')
    selected.value.spec.inputSchema = input
    selected.value.spec.outputSchema = output
    notice.value = tr('schemaChanged')
    error.value = ''
    schemaDirty.value = false
    return true
  }
  catch {
    error.value = tr('formatError')
    return false
  }
}
function bindVersion() {
  if (!selectedNode.value)
    return
  const child = agentVersions.value.find(version => version.id === selectedNode.value?.versionRef)
  if (!child)
    return
  const required = child.spec.inputSchema.required
  if (Array.isArray(required))
    selectedNode.value.input = { ...selectedNode.value.input, ...Object.fromEntries(required.filter((key): key is string => typeof key === 'string').map(key => [key, selectedNode.value?.input?.[key] || { source: 'input', path: `/${key}` }])) }
  inputMapping.value = pretty(selectedNode.value.input || {})
  notice.value = tr('schemaChanged')
}
const mappingIssues = computed(() => {
  const spec = selected.value?.spec
  if (!spec?.body)
    return []
  const issues: string[] = []
  const schemas = new Map<string, Record<string, unknown>>()
  const field = (schema: Record<string, unknown> | undefined, path: string) => {
    let current = schema
    for (const key of path.split('/').slice(1)) {
      if (!current)
        return undefined
      const properties = current.properties
      if (!properties || typeof properties !== 'object' || Array.isArray(properties))
        return undefined
      const candidate: unknown = object(properties)[key.replace(/~1/g, '/').replace(/~0/g, '~')]
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
        return undefined
      current = object(candidate)
    }
    return current
  }
  for (const node of spec.body.steps) {
    const child = agentVersions.value.find(version => version.id === node.versionRef)
    if (node.type === 'agent_call') {
      if (!child) {
        issues.push(`${node.id} · ${tr('dependencyUnavailable')}`)
      }
      else {
        const required = child.spec.inputSchema.required
        if (Array.isArray(required)) {
          for (const key of required) {
            if (typeof key === 'string' && !node.input?.[key])
              issues.push(`${node.id}.input.${key}`)
          }
        }
        if (child.spec.inputSchema.additionalProperties === false) {
          const properties = object(child.spec.inputSchema.properties || {})
          for (const key of Object.keys(node.input || {})) {
            if (!(key in properties))
              issues.push(`${node.id}.input.${key}`)
          }
        }
      }
    }
    for (const reference of bindings(node)) {
      const schema = reference.source === 'input' ? spec.inputSchema : reference.source === 'node_output' ? schemas.get(reference.nodeId || '') : undefined
      if (schema && reference.path && !field(schema, reference.path))
        issues.push(`${node.id} → ${reference.path}`)
    }
    if (node.type === 'input') {
      schemas.set(node.id, spec.inputSchema)
    }
    else if (child) {
      schemas.set(node.id, child.spec.outputSchema)
    }
    else if (node.type === 'transform') {
      schemas.set(node.id, { type: 'object', properties: Object.fromEntries(Object.entries(node.input || {}).map(([key, reference]) => [key, field(reference.source === 'input' ? spec.inputSchema : schemas.get(reference.nodeId || ''), reference.path || '') || {}])) })
    }
    else if (node.type === 'output' && node.value) {
      const source = field(node.value.source === 'input' ? spec.inputSchema : schemas.get(node.value.nodeId || ''), node.value.path || '')
      const required = spec.outputSchema.required
      if (source?.properties && Array.isArray(required)) {
        for (const key of required) {
          if (typeof key === 'string' && !(key in object(source.properties)))
            issues.push(`${node.id}.output.${key}`)
        }
      }
    }
  }
  return issues
})
function dragNode(event: NodeDragEvent) {
  if (!selected.value)
    return
  selected.value.editor.positions ||= {}
  selected.value.editor.positions[event.node.id] = { x: event.node.position.x, y: event.node.position.y }
}
async function publish() {
  await action(async () => {
    await save()
    if (!selected.value)
      return
    if (mappingIssues.value.length)
      throw new Error(`${tr('schemaChanged')} ${mappingIssues.value.join(', ')}`)
    const version = await api.publish(selected.value.id)
    versions.value = await api.versions()
    publishedVersionId.value = version.id
    notice.value = `${tr('published')} v${version.ordinal} · ${version.hash.slice(0, 10)}`
  })
}
async function startRun() {
  await action(async () => {
    if (dirty.value)
      throw new Error(tr('dirtyRun'))
    if (!publishedVersionId.value)
      throw new Error(tr('publishFirst'))
    const input = object(JSON.parse(runInput.value))
    const id = await api.start(publishedVersionId.value, input)
    runId.value = id
    mode.value = 'monitor'
    locationState()
  })
}
async function observe(id: string) {
  observer?.abort()
  observer = new AbortController()
  const signal = observer.signal
  events.value = []
  details.value = null
  run.value = null
  let cursor = 0
  while (!signal.aborted) {
    try {
      const snapshot = await api.run(id)
      if (signal.aborted)
        return
      run.value = snapshot
      if (snapshot.status === 'QUEUED') {
        await new Promise(resolve => setTimeout(resolve, 300))
        continue
      }
      if (snapshot.status === 'REJECTED') {
        connected.value = false
        return
      }
      connected.value = true
      await api.events(id, cursor, signal, (event) => {
        if (event.seq <= cursor || event.runId !== id)
          return
        cursor = event.seq
        events.value = [...events.value, event].slice(-500)
      })
      const final = await api.run(id)
      if (signal.aborted)
        return
      run.value = final
      if (finalStatuses.has(final.status)) {
        connected.value = false
        return
      }
    }
    catch (failure) {
      if (signal.aborted)
        return
      connected.value = false
      if (failure instanceof Error && failure.message === 'AUTH_REQUIRED') {
        authenticated.value = false
        return
      }
    }
    await new Promise(resolve => setTimeout(resolve, 800))
  }
}
watch(runId, (id) => {
  if (id && authenticated.value)
    void observe(id)
})
onBeforeUnmount(() => observer?.abort())
async function hydrateUrl() {
  const id = new URLSearchParams(location.search).get('definition')
  const definition = definitions.value.find(item => item.id === id)
  if (definition)
    choose(definition, true, true)
  if (runId.value) {
    mode.value = 'monitor'
    void observe(runId.value)
  }
}
async function logout() {
  await action(async () => {
    await api.logout()
    observer?.abort()
    runId.value = ''
    run.value = null
    events.value = []
    selected.value = null
    definitions.value = []
    versions.value = []
    authenticated.value = false
    history.replaceState({}, '', location.pathname)
  })
}
onMounted(async () => {
  try {
    await api.session()
    authenticated.value = true
    await reload()
    await hydrateUrl()
  }
  catch {
    authenticated.value = false
  }
})
</script>

<template>
  <main v-if="!authenticated" class="login-page">
    <form class="form login-form" @submit.prevent="login">
      <div class="form__header">
        <span class="brand">NexusFlow<span class="brand-mark">✳</span></span><h1>{{ tr('login') }}</h1><p>{{ tr('loginHint') }}</p>
      </div>
      <div class="form__body">
        <label class="form__field"><span>{{ tr('username') }}</span><input v-model="username" class="input" name="username" autocomplete="username" required></label>
        <label class="form__field"><span>{{ tr('password') }}</span><input v-model="password" class="input" name="password" type="password" autocomplete="current-password" required></label>
        <p v-if="error" class="banner banner--error" role="alert">
          {{ error }}
        </p>
        <button class="btn btn-primary" :disabled="busy" type="submit">
          {{ busy ? tr('busy') : tr('signIn') }} <span aria-hidden="true">↗</span>
        </button>
      </div>
    </form>
  </main>
  <main v-else class="app-layout" :class="{ 'sidebar-collapsed': collapsed }">
    <aside class="sidebar" :aria-label="tr('definitions')">
      <div class="sidebar__brand">
        <span class="brand">NexusFlow<span class="brand-mark">✳</span></span><button class="btn btn-icon" :aria-label="tr('fold')" @click="collapsed = !collapsed">
          ≡
        </button>
      </div>
      <div class="sidebar__section-label">
        {{ tr('subtitle') }}
      </div>
      <div class="create-actions">
        <button class="btn btn-primary" :disabled="busy" data-testid="new-workflow" @click="create('workflow')">
          ＋ {{ tr('workflow') }}
        </button><button class="btn btn-secondary" :disabled="busy" data-testid="new-agent" @click="create('agent')">
          ＋ {{ tr('agent') }}
        </button>
      </div>
      <div class="sidebar__section-label section-title">
        {{ tr('definitions') }} <button class="btn btn-icon" :aria-label="tr('retry')" @click="action(reload)">
          ↻
        </button>
      </div>
      <nav class="sidebar__nav">
        <button v-for="item in definitions" :key="item.id" class="sidebar__item" :class="{ 'sidebar__item--active': selected?.id === item.id }" :aria-current="selected?.id === item.id ? 'page' : undefined" @click="choose(item)">
          <span class="definition-icon" aria-hidden="true">{{ item.kind === 'agent' ? '✳' : '⌘' }}</span><span class="ellipsis">{{ item.name }}</span><small>{{ item.kind === 'agent' ? 'AG' : 'WF' }}</small>
        </button>
      </nav>
      <div class="sidebar__footer">
        <span class="status-dot" />{{ tr('runtimeReady') }}<button class="btn btn-icon" :aria-label="tr('signOut')" @click="logout">
          ↗
        </button>
      </div>
    </aside>
    <section class="workspace">
      <header class="workspace-header">
        <div class="workspace-heading">
          <button v-if="collapsed" class="btn btn-icon" :aria-label="tr('expand')" @click="collapsed = false">
            ≡
          </button><template v-if="selected">
            <span class="eyebrow">{{ selected.kind === 'agent' ? tr('agentTitle') : tr('editorTitle') }}</span><input v-model="selected.name" class="document-title" :disabled="busy" :aria-label="tr('name')"><span class="badge" :class="{ 'badge-orange': dirty }">{{ dirty ? tr('unsaved') : tr('saved') }}</span>
          </template><h1 v-else>
            {{ tr('title') }}
          </h1>
        </div>
        <div class="toolbar">
          <button class="btn btn-quiet" @click="switchLocale">
            {{ tr('switchLocale') }}
          </button><template v-if="selected">
            <button class="btn btn-secondary" :disabled="busy" @click="action(save)">
              {{ tr('save') }}
            </button><button class="btn btn-secondary" :disabled="busy" @click="publish">
              {{ tr('publish') }} ↗
            </button><button class="btn btn-primary" :disabled="busy || !publishedVersionId" @click="mode = mode === 'monitor' ? 'editor' : 'monitor'">
              {{ mode === 'monitor' ? tr('showEditor') : tr('run') }} <span aria-hidden="true">▶</span>
            </button>
          </template>
        </div>
      </header>
      <div v-if="error" class="banner banner--error" role="alert">
        {{ error }}<button class="btn btn-icon" :aria-label="tr('clearError')" @click="error = ''">
          ×
        </button>
      </div>
      <div v-if="notice" class="banner" role="status">
        {{ notice }}
      </div>
      <div v-if="!selected && mode !== 'monitor'" class="empty-state">
        <span class="empty-state__icon" aria-hidden="true">✳</span><h2 class="empty-state__title">
          {{ tr('empty') }}
        </h2><p class="empty-state__body">
          {{ tr('emptyBody') }}
        </p><button class="btn btn-primary" @click="create('workflow')">
          {{ tr('startDesign') }} ↗
        </button>
      </div>
      <template v-else-if="mode === 'editor' && selected">
        <div class="document-bar">
          <span>{{ tr('revision') }} {{ selected.revision }}</span><span>{{ selected.spec.kind === 'workflow' ? tr('sequence') : tr('privacy') }}</span><button class="btn btn-quiet" @click="schemaOpen = !schemaOpen">
            {{ schemaOpen ? tr('closeSchema') : tr('openSchema') }}
          </button><button class="btn btn-quiet" @click="settingsOpen = !settingsOpen">
            {{ tr('showSettings') }}
          </button>
        </div>
        <section v-if="schemaOpen" class="contract-editor" :inert="busy">
          <label class="form__field">{{ tr('inputSchema') }}<textarea v-model="inputSchemaText" class="input code-input" rows="7" @input="schemaDirty = true" /></label><label class="form__field">{{ tr('outputSchema') }}<textarea v-model="outputSchemaText" class="input code-input" rows="7" @input="schemaDirty = true" /></label><button class="btn btn-secondary" @click="applySchemas">
            {{ tr('confirmMapping') }}
          </button>
        </section>
        <section v-if="settingsOpen" class="budget-editor" :inert="busy">
          <label v-for="(label, key) in { maxModelCalls: 'modelCalls', maxToolCalls: 'toolCalls', maxTokens: 'tokens', timeoutSeconds: 'timeout' }" :key="key" class="form__field">{{ tr(label) }}<input v-model.number="selected.spec.budget[key]" class="input" type="number" min="1"></label><small>{{ tr('budgetHint') }}</small>
        </section>
        <section v-if="selected.spec.agent" class="agent-workspace" :inert="busy">
          <div class="agent-main form__body">
            <div class="section-heading">
              <span class="agent-emblem">✳</span><div><h2>{{ tr('agentTitle') }}</h2><p>{{ tr('privacy') }}</p></div>
            </div><label class="form__field">{{ tr('prompt') }}<textarea v-model="selected.spec.agent.prompt" class="input prompt-editor" rows="13" data-testid="agent-prompt" /></label><label class="form__field">{{ tr('model') }}<select v-model="selected.spec.agent.modelConnectionRef" class="input" data-testid="model-select"><option v-for="model in capabilities?.models" :key="model.id" :value="model.id" :disabled="model.available === false">{{ model.id === 'fixture' ? tr('fixture') : tr('live') }}</option></select></label><fieldset class="tool-choices">
              <legend>{{ tr('tools') }}</legend><label v-for="tool in capabilities?.tools" :key="tool.name" class="tool-choice"><input v-model="selected.spec.agent.tools" type="checkbox" :value="tool.name"><span>{{ tool.name }}<small>{{ tr('readOnly') }}</small></span></label>
            </fieldset>
          </div>
          <aside class="agent-preview">
            <span class="eyebrow">{{ tr('schema') }}</span><h3>{{ tr('inputSchema') }}</h3><pre>{{ pretty(selected.spec.inputSchema) }}</pre><h3>{{ tr('outputSchema') }}</h3><pre>{{ pretty(selected.spec.outputSchema) }}</pre><p>{{ tr('outputHint') }}</p><button class="btn btn-primary" :disabled="busy" @click="publish">
              {{ tr('publish') }} ↗
            </button>
          </aside>
        </section>
        <section v-else class="flow-workspace" :inert="busy">
          <div class="canvas-area">
            <div class="palette">
              <span class="eyebrow">{{ tr('add') }}</span><button v-for="type in ['agent_call', 'transform', 'tool']" :key="type" class="btn btn-secondary" :data-testid="`add-${type}`" @click="addNode(type)">
                ＋ {{ tr(type === 'tool' ? 'toolNode' : type) }}
              </button><span class="badge">{{ tr('later') }} · Branch / Parallel</span>
            </div><div class="canvas">
              <VueFlow :nodes="graphNodes" :edges="graphEdges" :nodes-connectable="false" :min-zoom="0.35" :max-zoom="1.8" @node-click="focusNode($event.node.id)" @node-drag-stop="dragNode">
                <template #node-default="{ data, id }">
                  <div class="flow-block" :data-node-id="id" :class="{ 'flow-block--selected': selectedNodeId === id }">
                    <Handle type="target" :position="Position.Top" /><div class="flow-block__index">
                      {{ String(data.index).padStart(2, '0') }}
                    </div><div><span class="eyebrow">{{ tr(data.kind === 'tool' ? 'toolNode' : String(data.kind)) }}</span><strong>{{ data.label }}</strong></div><span class="block-glyph" aria-hidden="true">{{ data.kind === 'agent_call' ? '✳' : data.kind === 'output' ? '↗' : '◇' }}</span><Handle type="source" :position="Position.Bottom" />
                  </div>
                </template>
              </VueFlow>
            </div><p class="canvas-hint">
              {{ tr('layoutHint') }}
            </p>
          </div>
          <aside class="configuration form__body">
            <div class="section-heading">
              <span class="eyebrow">{{ tr('configureNode') }}</span><span class="badge">{{ selectedNode?.type || '—' }}</span>
            </div><template v-if="selectedNode">
              <p v-if="mappingIssues.length" class="banner banner--error" role="alert">
                {{ tr('schemaChanged') }} {{ mappingIssues.join(', ') }}
              </p><h2>{{ nodeTitle(selectedNode) }}</h2><small>{{ tr('nodeId') }} · {{ selectedNode.id }}</small><label v-if="selectedNode.type === 'agent_call'" class="form__field">{{ tr('version') }}<select v-model="selectedNode.versionRef" class="input" data-testid="agent-version" @change="bindVersion"><option value="">{{ tr('selectVersion') }}</option><option v-for="version in agentVersions" :key="version.id" :value="version.id">{{ version.name }} · v{{ version.ordinal }} · {{ version.hash.slice(0, 6) }}</option></select></label><details v-if="selectedAgentVersion">
                <summary>{{ tr('schema') }}</summary><h3>{{ tr('inputSchema') }}</h3><pre>{{ pretty(selectedAgentVersion.spec.inputSchema) }}</pre><h3>{{ tr('outputSchema') }}</h3><pre>{{ pretty(selectedAgentVersion.spec.outputSchema) }}</pre>
              </details><label v-if="selectedNode.type === 'tool'" class="form__field">{{ tr('tool') }}<select v-model="selectedNode.toolRef" class="input"><option v-for="tool in capabilities?.tools" :key="tool.name">{{ tool.name }}</option></select></label><label v-if="selectedNode.type !== 'output'" class="form__field">{{ tr('inputMapping') }}<textarea v-model="inputMapping" class="input code-input" rows="7" @input="mappingDirty = true" /></label><label v-if="selectedNode.type !== 'output'" class="form__field">{{ tr('stateWrite') }}<textarea v-model="writeMapping" class="input code-input" rows="4" @input="mappingDirty = true" /></label><label v-if="selectedNode.type === 'output'" class="form__field">{{ tr('outputMapping') }}<textarea v-model="outputMapping" class="input code-input" rows="8" @input="mappingDirty = true" /></label><button class="btn btn-secondary" @click="applyMapping">
                {{ tr('confirmMapping') }}
              </button><div class="node-actions">
                <button class="btn btn-quiet" @click="moveNode(-1)">
                  ↑ {{ tr('moveUp') }}
                </button><button class="btn btn-quiet" @click="moveNode(1)">
                  ↓ {{ tr('moveDown') }}
                </button><button class="btn btn-danger" @click="removeNode">
                  {{ tr('remove') }}
                </button>
              </div>
            </template><p v-else class="selection-hint">
              {{ tr('selection') }}
            </p>
          </aside>
        </section>
      </template>
      <template v-else-if="mode === 'monitor'">
        <div class="document-bar">
          <span>{{ tr('monitor') }}</span><span class="badge" data-testid="run-status">{{ run?.status || tr('noRuns') }}</span><span :class="{ 'live-indicator': connected }">{{ run && finalStatuses.has(run.status) ? tr('runSaved') : connected ? tr('connected') : tr('reconnect') }}</span><code v-if="runId">{{ runId.slice(0, 8) }}</code>
        </div>
        <div class="run-controls">
          <label class="form__field">{{ tr('version') }}<select v-model="publishedVersionId" class="input"><option v-for="version in ownVersions" :key="version.id" :value="version.id">v{{ version.ordinal }} · {{ version.hash.slice(0, 10) }}</option></select></label><label class="form__field run-input-field">{{ tr('runInput') }}<textarea v-model="runInput" class="input code-input" rows="2" data-testid="run-input" /></label><button class="btn btn-primary" :disabled="busy || !publishedVersionId || dirty" data-testid="start-run" @click="startRun">
            {{ tr('start') }} ↗
          </button>
        </div>
        <section class="monitor-workspace">
          <aside class="invocation-tree">
            <span class="eyebrow">{{ tr('calls') }}</span><button v-for="item in run?.invocations" :key="item.id" class="invocation-item" :class="{ child: item.parent_id }" @click="details = item">
              <span>{{ item.kind === 'agent_call' || item.kind === 'agent' ? '✳' : '◇' }}</span><div class="ellipsis">
                <strong>{{ item.node_id }}</strong><small>{{ item.kind }}</small>
              </div><small>{{ invocationStatus(item) }}</small>
            </button><p v-if="!run?.invocations.length" class="selection-hint">
              {{ tr('noRuns') }}
            </p><div v-if="run?.usage" class="usage">
              <span>{{ tr('modelCalls') }} <strong>{{ run.usage.modelCalls }}</strong></span><span>{{ tr('toolCalls') }} <strong>{{ run.usage.toolCalls }}</strong></span><span>{{ tr('tokens') }} <strong>{{ run.usage.tokensReserved }}</strong></span><small>{{ run.usage.costStatus === 'FIXTURE_ZERO_COST' ? tr('fixture') : tr('unknownCost') }}</small>
            </div>
          </aside><div class="event-panel">
            <div class="section-heading">
              <span class="eyebrow">{{ tr('timeline') }}</span><small>{{ events.length }} {{ tr('events') }}</small>
            </div><p class="monitor-hint">
              {{ tr('progressHint') }}
            </p><ol class="timeline" data-testid="event-timeline">
              <li v-for="item in events" :key="item.eventId" class="timeline__item">
                <span class="timeline__marker" :class="{ committed: item.commitStatus === 'COMMITTED' }" /><button class="timeline__content" @click="details = item">
                  <div class="event-meta">
                    <time>{{ new Date(item.time).toLocaleTimeString() }}</time><span class="badge" :class="{ 'badge-orange': item.commitStatus === 'COMMITTED' }">{{ item.commitStatus === 'COMMITTED' ? tr('committed') : tr('progress') }}</span><span>#{{ item.seq }}</span>
                  </div><strong>{{ item.type }}</strong><span>{{ item.nodeId || item.invocationId?.split('/').at(-1) || tr('status') }}</span>
                </button>
              </li>
            </ol><p v-if="!events.length" class="selection-hint">
              {{ tr('noEvent') }}
            </p>
          </div><aside class="run-details">
            <span class="eyebrow">{{ tr('details') }}</span><div v-if="run?.errorCode" class="banner banner--error">
              {{ run.errorCode }}
            </div><h3 v-if="run?.output">
              {{ tr('final') }}
            </h3><pre v-if="run?.output" data-testid="run-output">{{ pretty(run.output) }}</pre><h3 v-if="details">
              {{ tr('selection') }}
            </h3><pre v-if="details">{{ pretty(details) }}</pre><p v-else>
              {{ tr('inspect') }}
            </p>
          </aside>
        </section>
      </template>
    </section>
  </main>
</template>
