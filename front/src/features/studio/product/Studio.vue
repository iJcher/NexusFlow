<script setup lang="ts">
import type { NodeDragEvent } from '@vue-flow/core'
import type { ICapabilities, IConversationTurn, IDefinition, IExecutionNode, IExecutionSpec, IRunView, IVersion, IWorkspace } from '@/types/execution-v2.types'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ExecutionService as api, object } from '@/services/v2/execution.service'
import { useActivityProjection } from './activityProjection'
import { useAnswerProjection } from './answerProjection'
import ChatComposer from './ChatComposer.vue'
import ConnectionManager from './ConnectionManager.vue'
import ConversationMessages from './ConversationMessages.vue'
import { useConversationScroll } from './conversationScroll'
import { allNodes, bindingOptions, bindingSchema, budgetLimits, initialSpec, makeNode, nodeLabel, outputSchema, record, referenced, sameBinding, sequences, signature, uid } from './editor'
import ExecutionActivity from './ExecutionActivity.vue'
import { useDraftHistory } from './history'
import MemoryManager from './MemoryManager.vue'
import NodeConfiguration from './NodeConfiguration.vue'
import ProductModal from './ProductModal.vue'
import ResultView from './ResultView.vue'
import SchemaEditor from './SchemaEditor.vue'
import SourceReferences from './SourceReferences.vue'
import StateEditor from './StateEditor.vue'
import ToastHost from './ToastHost.vue'
import { toast } from './toasts'
import WorkbenchSplit from './WorkbenchSplit.vue'
import WorkflowCanvas from './WorkflowCanvas.vue'

const { t, te } = useI18n()
const tr = (key: string) => t(`product.${key}`)
const route = useRoute()
const connectionsPage = computed(() => route.path === '/connections')
const router = useRouter()
// Definition documents are JSON values. A JSON copy also removes nested Vue proxies
// introduced by node configuration events; toRaw only unwraps the outer object.
function copyDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
const authenticated = ref(false)
const busy = ref(false)
const email = ref('')
const code = ref('')
const challenge = ref('')
const cooldown = ref(0)
const definitions = ref<IDefinition[]>([])
const versions = ref<IVersion[]>([])
const workspaces = ref<IWorkspace[]>([])
const workspace = ref('')
const activeWorkspace = ref('')
const section = ref<'agent' | 'workflow'>('agent')
const search = ref('')
const selected = ref<IDefinition | null>(null)
const { undo, redo, canUndo, canRedo, recordHistory } = useDraftHistory(selected)
const capabilities = ref<ICapabilities | null>(null)
const baseline = ref('')
const saveState = ref('saved')
const selectedNodeId = ref('')
const modal = ref<'' | 'create' | 'palette' | 'agent' | 'tools' | 'settings'>('')
const newKind = ref<'agent' | 'workflow'>('agent')
const newName = ref('')
const resourceSearch = ref('')
const targetSequence = ref('main')
const replacementNode = ref('')
const pickerKind = ref<'agent' | 'workflow'>('agent')
const pickerTarget = ref<'node' | 'tool'>('node')
const returnToWorkflow = ref<{
  id: string
  sequence: string
  node?: string
  kind: 'agent' | 'workflow'
  target: 'node' | 'tool'
} | null>(null)
const input = ref<Record<string, unknown>>({})
const sentInput = ref<Record<string, unknown> | null>(null)
const view = ref<IRunView | null>(null)
const events = ref<import('@/types/execution-v2.types').IExecutionEvent[]>([])
const answers = useAnswerProjection()
const activity = useActivityProjection()
const activityPanel = ref<InstanceType<typeof ExecutionActivity>>()
const composer = ref<InstanceType<typeof ChatComposer>>()
const previewScroll = ref<HTMLElement>()
const previewContent = ref<HTMLElement>()
const scrolling = useConversationScroll(previewScroll, previewContent)
const scrollLatest = scrolling.latest
watch(() => answers.messages.value.map(message => message.ordinal).join(','), () => {
  scrolling.schedule()
}, { flush: 'post' })
const runId = ref('')
const conversationId = ref('')
const continuousConversation = ref(true)
const conversationTurns = ref<IConversationTurn[]>([])
const savedConversations = ref<Awaited<ReturnType<typeof api.conversations>>>([])
const blankConversation = ref(false)
const memoryOpen = ref(false)
let historyLoadedFor = ''
const previewBusy = ref(false)
const approvalBusy = ref(false)
const connected = ref(false)
const comments = ref<Record<string, string>>({})
let autosaveTimer: ReturnType<typeof setTimeout> | undefined
let saving: Promise<void> | null = null
let observer: AbortController | null = null
let countdown: ReturnType<typeof setInterval> | undefined
const terminal = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'NEEDS_ATTENTION', 'REJECTED'])
const dirty = computed(() => signature(selected.value) !== baseline.value)
const currentNode = computed(() => selected.value ? allNodes(selected.value.spec).find(node => node.id === selectedNodeId.value) : undefined)
const library = computed(() => definitions.value.filter(item => item.kind === section.value && item.name.toLowerCase().includes(search.value.toLowerCase())))
const compatibleAgents = computed(() => versions.value.filter(item => item.spec.kind === pickerKind.value && item.definitionId !== selected.value?.id && (pickerTarget.value === 'node' || item.manifest?.bundleDigest === capabilities.value?.bundleDigest) && (!resourceSearch.value || (item.name || '').toLowerCase().includes(resourceSearch.value.toLowerCase()))))
const ownVersions = computed(() => versions.value.filter(item => item.definitionId === selected.value?.id))
const availableModels = computed(() => capabilities.value?.models.filter(model => model.available !== false) || [])
const editableBudgetKeys = computed(() => (Object.keys(selected.value?.spec.budget || {}) as (keyof IExecutionSpec['budget'])[]).filter(key => key !== 'maxTokens' || capabilities.value?.tokenReservationPolicy !== 'unlimited'))
const resultLabels = computed(() => {
  const labels: Record<string, string> = {}
  if (!selected.value)
    return labels
  for (const schema of [selected.value.spec.inputSchema, selected.value.spec.outputSchema]) {
    for (const [key, field] of Object.entries(record(schema.properties))) {
      if (record(field).title)
        labels[key] = String(record(field).title)
    }
  }
  for (const node of allNodes(selected.value.spec)) {
    labels[node.id] = nodeLabel(node, versions.value, tr)
    node.branches?.forEach((body, index) => {
      labels[body.id] = `${tr('parallelPath')} ${index + 1}`
    })
    node.cases?.forEach((item, index) => {
      labels[item.body.id] = `${tr('conditionMatches')} ${index + 1}`
    })
    if (node.default)
      labels[node.default.id] = tr('otherwise')
  }
  return labels
})
provide('resultLabels', resultLabels)
function errorMessage(failure: unknown) {
  const value = failure instanceof Error ? failure.message : ''
  const key = value.split(/[ ·]/)[0]
  return te(`product.errors.${key}`) ? tr(`errors.${key}`) : value.startsWith('STREAM_') ? tr('reconnecting') : tr('errors.operationFailed')
}
async function action(work: () => Promise<void>) {
  if (busy.value)
    return false
  busy.value = true
  try {
    await work()
    return true
  }
  catch (failure) {
    toast(errorMessage(failure))
    return false
  }
  finally {
    busy.value = false
  }
}
function locationState() {
  const path = `/${section.value === 'agent' ? 'agents' : 'workflows'}${selected.value ? `/${selected.value.id}` : ''}`
  const query: Record<string, string> = { workspace: workspace.value }
  if (runId.value)
    query.run = runId.value
  else if (blankConversation.value)
    query.chat = 'new'
  void router[route.path === path ? 'replace' : 'push']({ path, query })
}
async function reload() {
  const data = await Promise.all([api.definitions(), api.versions(), api.capabilities()])
  definitions.value = data[0]
  versions.value = data[1]
  capabilities.value = data[2]
}
async function initialize() {
  const session = object(await api.session())
  workspace.value = String(session.workspaceId)
  activeWorkspace.value = workspace.value
  api.selectWorkspace(workspace.value)
  workspaces.value = await api.workspaces()
  const requestedWorkspace = String(route.query.workspace || '')
  if (requestedWorkspace && requestedWorkspace !== workspace.value) {
    if (workspaces.value.some(space => space.id === requestedWorkspace)) {
      workspace.value = requestedWorkspace
      activeWorkspace.value = requestedWorkspace
      api.selectWorkspace(requestedWorkspace)
    }
    else {
      toast(tr('errors.WORKSPACE_ACCESS_DENIED'))
    }
  }
  await reload()
  authenticated.value = true
  const params = new URLSearchParams(location.search)
  const definition = definitions.value.find(item => item.id === (route.params.id || params.get('definition')))
  if (definition) {
    const previousRun = String(route.query.run || params.get('run') || '')
    const fresh = route.query.chat === 'new'
    choose(definition, false)
    await restorePreview(previousRun, fresh)
    locationState()
  }
  else {
    section.value = route.path.startsWith('/workflows') ? 'workflow' : 'agent'
    if (!connectionsPage.value)
      locationState()
  }
}
async function loadRoute() {
  if (!authenticated.value)
    return
  const target = String(route.query.workspace || workspace.value)
  if (target !== workspace.value) {
    if (!workspaces.value.some(space => space.id === target)) {
      toast(tr('errors.WORKSPACE_ACCESS_DENIED'))
      locationState()
      return
    }
    await save()
    observer?.abort()
    selected.value = null
    baseline.value = ''
    api.selectWorkspace(target)
    await reload()
    workspace.value = target
    activeWorkspace.value = target
  }
  const id = String(route.params.id || '')
  const kind = route.path.startsWith('/workflows') ? 'workflow' : 'agent'
  if (id && !definitions.value.some(item => item.id === id)) {
    observer?.abort()
    selected.value = null
    baseline.value = ''
    await reload()
  }
  const changedDefinition = id !== selected.value?.id
  if (changedDefinition) {
    const item = definitions.value.find(item => item.id === id && item.kind === kind)
    if (item) {
      choose(item, false)
    }
    else {
      observer?.abort()
      selected.value = null
      baseline.value = ''
      runId.value = ''
      conversationId.value = ''
      conversationTurns.value = []
      historyLoadedFor = ''
      view.value = null
      if (id)
        toast(tr('errors.RESOURCE_NOT_FOUND'))
    }
  }
  section.value = kind
  const previous = String(route.query.run || '')
  if (selected.value && previous && runId.value !== previous) {
    runId.value = previous
    void observe(previous)
  }
  else if (selected.value && (changedDefinition || (!previous && route.query.chat !== 'new'))) {
    await restorePreview(previous, route.query.chat === 'new')
    locationState()
  }
  else if (selected.value && !previous && route.query.chat === 'new' && runId.value) {
    newConversation()
  }
}
watch(() => route.fullPath, () => {
  void loadRoute().catch(error => toast(errorMessage(error)))
})
async function leaveEditor() {
  try {
    await save()
    return true
  }
  catch (error) {
    toast(errorMessage(error))
    return false
  }
}
onBeforeRouteLeave(leaveEditor)
onBeforeRouteUpdate(leaveEditor)
async function changeWorkspace() {
  const target = workspace.value
  workspace.value = activeWorkspace.value
  await action(async () => {
    await save()
    observer?.abort()
    selected.value = null
    baseline.value = ''
    view.value = null
    runId.value = ''
    conversationId.value = ''
    conversationTurns.value = []
    historyLoadedFor = ''
    events.value = []
    activity.clear()
    api.selectWorkspace(target)
    try {
      await reload()
    }
    catch (error) {
      api.selectWorkspace(activeWorkspace.value)
      throw error
    }
    workspace.value = target
    activeWorkspace.value = target
    locationState()
  })
}
function choose(item: IDefinition, syncRoute = true) {
  observer?.abort()
  selected.value = copyDocument(item)
  memoryOpen.value = false
  baseline.value = signature(selected.value)
  saveState.value = 'saved'
  selectedNodeId.value = ''
  section.value = item.kind
  view.value = null
  events.value = []
  answers.clear()
  activity.clear()
  sentInput.value = null
  void scrollLatest()
  runId.value = ''
  blankConversation.value = false
  savedConversations.value = []
  conversationId.value = ''
  conversationTurns.value = []
  historyLoadedFor = ''
  comments.value = {}
  input.value = Object.fromEntries(Object.entries(record(item.spec.inputSchema.properties)).map(([key, field]) => [key, record(field).type === 'boolean' ? false : '']))
  if (syncRoute)
    locationState()
}
async function openDefinition(item: IDefinition) {
  await action(async () => {
    await save()
    choose(item, false)
    await restorePreview()
    locationState()
  })
}
async function refreshConversations() {
  const id = selected.value?.id
  if (!id)
    return
  const entries = await api.conversations(id)
  if (selected.value?.id === id)
    savedConversations.value = entries
}
async function restorePreview(previous = '', fresh = false) {
  const id = selected.value?.id
  await refreshConversations()
  if (selected.value?.id !== id)
    return
  blankConversation.value = fresh
  const target = previous || (!fresh ? savedConversations.value[0]?.runId : '')
  if (target) {
    observer?.abort()
    conversationId.value = ''
    conversationTurns.value = []
    historyLoadedFor = ''
    view.value = null
    sentInput.value = null
    events.value = []
    answers.clear()
    activity.clear()
    comments.value = {}
    runId.value = target
    void observe(target)
  }
}
async function selectConversation(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  if (!id || id === runId.value)
    return
  observer?.abort()
  conversationId.value = ''
  conversationTurns.value = []
  historyLoadedFor = ''
  view.value = null
  sentInput.value = null
  answers.clear()
  activity.clear()
  events.value = []
  runId.value = id
  blankConversation.value = false
  locationState()
  await observe(id)
}
async function back() {
  return action(async () => {
    await save()
    observer?.abort()
    selected.value = null
    baseline.value = ''
    runId.value = ''
    conversationId.value = ''
    conversationTurns.value = []
    historyLoadedFor = ''
    view.value = null
    locationState()
  })
}
async function navigate(kind: 'agent' | 'workflow') {
  if (await back()) {
    section.value = kind
    locationState()
  }
}
async function save() {
  clearTimeout(autosaveTimer)
  if (saving)
    return saving
  if (!selected.value || !dirty.value)
    return
  saving = (async () => {
    saveState.value = 'saving'
    try {
      while (selected.value && dirty.value) {
        const snapshot = copyDocument(selected.value)
        const saved = await api.save(snapshot)
        selected.value.revision = saved.revision
        definitions.value = definitions.value.map(item => item.id === saved.id ? saved : item)
        baseline.value = signature(snapshot)
      }
      saveState.value = 'saved'
    }
    catch (failure) {
      saveState.value = 'saveFailed'
      toast(errorMessage(failure))
      throw failure
    }
    finally {
      saving = null
    }
  })()
  return saving
}
watch(() => JSON.stringify(selected.value?.spec.inputSchema), () => {
  if (!selected.value)
    return
  input.value = Object.fromEntries(Object.entries(record(selected.value.spec.inputSchema.properties)).map(([key, raw]) => {
    const type = record(raw).type
    const value = input.value[key]
    return [key, type === 'boolean' ? typeof value === 'boolean' ? value : false : type === 'number' || type === 'integer' ? typeof value === 'number' ? value : undefined : type === 'object' ? record(value) : type === 'array' ? Array.isArray(value) ? value : [] : typeof value === 'string' ? value : '']
  }))
})
watch(() => signature(selected.value), () => {
  if (!selected.value || !dirty.value)
    return
  saveState.value = 'unsaved'
  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    void save().catch(() => {
    })
  }, 700)
})
function validateDraft() {
  if (!selected.value?.name.trim())
    throw new Error('NAME_REQUIRED')
  const spec = selected.value.spec
  for (const [key, limit] of Object.entries(budgetLimits)) {
    const value = spec.budget[key as keyof typeof spec.budget]
    if (!Number.isInteger(value) || value < limit.min || value > limit.max)
      throw new Error('BUDGET_CONFIGURATION_INVALID')
  }
  if (spec.agent && !spec.agent.prompt.trim())
    throw new Error('AGENT_CONFIGURATION_REQUIRED')
  for (const node of allNodes(spec)) {
    if (node.type === 'human' && !node.title?.trim()) {
      selectedNodeId.value = node.id
      throw new Error('HUMAN_TITLE_REQUIRED')
    }
    for (const item of node.cases || []) {
      if (['gt', 'gte', 'lt', 'lte'].includes(item.when.operator) && (typeof item.when.right !== 'number' || !Number.isFinite(item.when.right))) {
        selectedNodeId.value = node.id
        throw new Error('CONDITION_NUMBER_REQUIRED')
      }
    }
    if (['agent_call', 'workflow_call'].includes(node.type) && !versions.value.some(version => version.id === node.versionRef))
      throw new Error('UNSUPPORTED_EXECUTION_VERSION')
    const options = bindingOptions(spec, node, versions.value, tr, true)
    for (const binding of [...Object.values(node.input || {}), ...Object.values(node.write || {}), ...(node.value ? [node.value] : []), ...(node.cases || []).map(item => item.when.left)]) {
      if (binding.source !== 'literal' && !options.some(option => sameBinding(option.binding, binding))) {
        selectedNodeId.value = node.id
        throw new Error('INVALID_RESULT_SCOPE')
      }
    }
  }
}
function openCreate(kind: 'agent' | 'workflow') {
  newKind.value = kind
  newName.value = ''
  modal.value = 'create'
}
async function createDefinition() {
  await action(async () => {
    if (!newName.value.trim()) {
      toast(tr('nameRequired'))
      return
    }
    await save()
    const spec = initialSpec(newKind.value, availableModels.value.find(model => model.mode === 'live')?.id || availableModels.value[0]?.id || 'validation-model', tr)
    const created = await api.create(newName.value.trim(), spec)
    await reload()
    choose(created)
    modal.value = ''
  })
}
async function publish() {
  await action(async () => {
    await save()
    validateDraft()
    if (!selected.value)
      return
    await api.publish(selected.value.id)
    versions.value = await api.versions()
    toast(tr('publishedToast'), 'success')
    if (returnToWorkflow.value) {
      const pending = returnToWorkflow.value
      returnToWorkflow.value = null
      const parent = definitions.value.find(item => item.id === pending.id)
      if (parent) {
        choose(parent)
        targetSequence.value = pending.sequence
        replacementNode.value = pending.node || ''
        pickerKind.value = pending.kind
        pickerTarget.value = pending.target
        modal.value = 'agent'
      }
    }
  })
}
function addStep(sequence: string) {
  targetSequence.value = sequence
  replacementNode.value = ''
  modal.value = 'palette'
}
function insert(type: string) {
  if (['agent_call', 'workflow_call'].includes(type)) {
    openExecutionPicker(type === 'workflow_call' ? 'workflow' : 'agent', 'node')
    return
  }
  if (!selected.value?.spec.body)
    return
  const body = sequences(selected.value.spec.body).find(item => item.id === targetSequence.value)
  if (!body)
    return
  const node = makeNode(type, tr)
  recordHistory()
  const position = body.steps.findIndex(item => item.type === 'output')
  if (type === 'human') {
    const previous = position < 0 ? body.steps.at(-1) : body.steps[position - 1]
    node.input = { context: previous && previous.type !== 'input' ? { source: 'node_output', nodeId: previous.id, path: '' } : { source: 'input', path: '' } }
  }
  body.steps.splice(position < 0 ? body.steps.length : position, 0, node)
  if (body === selected.value.spec.body) {
    body.steps.at(-1)!.value = { source: 'node_output', nodeId: node.id, path: '' }
    selected.value.spec.outputSchema = outputSchema(node, versions.value)
  }
  selectedNodeId.value = node.id
  modal.value = ''
  recordHistory()
}
function attachAgent(version: IVersion) {
  if (selected.value?.spec.agent && pickerTarget.value === 'tool') {
    const agent = selected.value.spec.agent
    if ((agent.executionTools?.length || 0) >= 8) {
      toast(tr('executionToolLimit'))
      return
    }
    if (agent.executionTools?.some(tool => tool.versionRef === version.id))
      return
    agent.executionTools = [...(agent.executionTools || []), { name: `${version.spec.kind}_${version.id.replace(/-/g, '').slice(0, 20)}`, description: t('product.executionToolDescription', { name: version.name || tr(version.spec.kind) }), versionRef: version.id }]
    modal.value = ''
    toast(tr('toolAdded'), 'success')
    return
  }
  if (!selected.value?.spec.body)
    return
  const body = sequences(selected.value.spec.body).find(item => item.id === targetSequence.value)
  if (!body)
    return
  const node = replacementNode.value ? allNodes(selected.value.spec).find(item => item.id === replacementNode.value) : { id: uid(version.spec.kind), type: version.spec.kind === 'agent' ? 'agent_call' : 'workflow_call' } as IExecutionNode
  if (!node)
    return
  recordHistory()
  node.versionRef = version.id
  node.input = Object.fromEntries(Object.keys(record(version.spec.inputSchema.properties)).map(key => [key, node.input?.[key] || { source: 'input', path: `/${key}` }]))
  if (!replacementNode.value) {
    const position = body.steps.findIndex(item => item.type === 'output')
    body.steps.splice(position < 0 ? body.steps.length : position, 0, node)
    if (body === selected.value.spec.body) {
      body.steps.at(-1)!.value = { source: 'node_output', nodeId: node.id, path: '' }
      selected.value.spec.outputSchema = copyDocument(version.spec.outputSchema)
    }
  }
  const endpoint = selected.value.spec.body.steps.at(-1)!
  if (endpoint.value?.source === 'node_output' && endpoint.value.nodeId === node.id && !endpoint.value.path)
    selected.value.spec.outputSchema = copyDocument(version.spec.outputSchema)
  selectedNodeId.value = node.id
  modal.value = ''
  toast(tr('resourceAdded'), 'success')
  recordHistory()
}
async function createAgentAndReturn() {
  if (!selected.value)
    return
  await action(async () => {
    await save()
    returnToWorkflow.value = { id: selected.value!.id, sequence: targetSequence.value, node: replacementNode.value, kind: pickerKind.value, target: pickerTarget.value }
    openCreate(pickerKind.value)
  })
}
function openExecutionPicker(kind: 'agent' | 'workflow', target: 'node' | 'tool') {
  pickerKind.value = kind
  pickerTarget.value = target
  resourceSearch.value = ''
  modal.value = 'agent'
}
function replaceExecution() {
  if (!currentNode.value || !selected.value?.spec.body)
    return
  replacementNode.value = currentNode.value.id
  targetSequence.value = sequences(selected.value.spec.body).find(body => body.steps.some(node => node.id === currentNode.value!.id))!.id
  openExecutionPicker(currentNode.value.type === 'workflow_call' ? 'workflow' : 'agent', 'node')
}
function updateNode(node: IExecutionNode) {
  if (!selected.value?.spec.body)
    return
  const body = sequences(selected.value.spec.body).find(item => item.steps.some(entry => entry.id === node.id))
  const previous = body?.steps.find(item => item.id === node.id)
  const structural = previous?.branches?.length !== node.branches?.length || previous?.cases?.length !== node.cases?.length
  if (structural)
    recordHistory()
  if (body)
    body.steps = body.steps.map(item => item.id === node.id ? node : item)
  if (node.type === 'output' && node.value)
    selected.value.spec.outputSchema = copyDocument(bindingSchema(selected.value.spec, node.value, versions.value))
  if (structural)
    recordHistory()
}
function updateChannels(channels: NonNullable<IExecutionSpec['state']>['channels']) {
  if (!selected.value)
    return
  const removed = Object.keys(selected.value.spec.state?.channels || {}).filter(key => !channels[key])
  if (allNodes(selected.value.spec).some(node => removed.some(key => key in (node.write || {}) || [...Object.values(node.input || {}), ...(node.value ? [node.value] : []), ...(node.cases || []).map(item => item.when.left)].some(binding => binding.source === 'state' && binding.path?.split('/')[1] === key)))) {
    toast(tr('referenced'))
    return
  }
  const structural = Object.keys(channels).length !== Object.keys(selected.value.spec.state?.channels || {}).length
  if (structural)
    recordHistory()
  selected.value.spec.state = { channels }
  if (structural)
    recordHistory()
}
function removeNode() {
  if (!selected.value?.spec.body || !currentNode.value)
    return
  const removing = currentNode.value
  const ids = new Set([removing.id, ...(removing.branches || []).flatMap(item => sequences(item).flatMap(body => body.steps.map(node => node.id))), ...(removing.cases || []).flatMap(item => sequences(item.body).flatMap(body => body.steps.map(node => node.id))), ...(removing.default ? sequences(removing.default).flatMap(body => body.steps.map(node => node.id)) : [])])
  const endpoint = selected.value.spec.body.steps.at(-1)!
  const automaticOutput = endpoint.value?.source === 'node_output' && endpoint.value.nodeId === removing.id && !endpoint.value.path
  const excluded = new Set([...ids, ...(automaticOutput ? [endpoint.id] : [])])
  if ([...ids].some(id => referenced(selected.value!.spec, id, excluded))) {
    toast(tr('referenced'))
    return
  }
  const body = sequences(selected.value.spec.body).find(item => item.steps.some(node => node.id === removing.id))
  recordHistory()
  if (body)
    body.steps = body.steps.filter(item => item.id !== removing.id)
  if (automaticOutput) {
    const previous = selected.value.spec.body.steps.at(-2)!
    endpoint.value = { source: 'node_output', nodeId: previous.id, path: '' }
    selected.value.spec.outputSchema = previous.type === 'input' ? copyDocument(selected.value.spec.inputSchema) : outputSchema(previous, versions.value)
  }
  selectedNodeId.value = ''
  recordHistory()
}
function moveNode(direction: number) {
  if (!selected.value?.spec.body || !currentNode.value)
    return
  const body = sequences(selected.value.spec.body).find(item => item.steps.some(node => node.id === selectedNodeId.value))
  if (!body)
    return
  const index = body.steps.findIndex(node => node.id === selectedNodeId.value)
  const next = index + direction
  if (next < 0 || next >= body.steps.length || ['input', 'output'].includes(body.steps[next].type))
    return
  const before = [...body.steps]
  recordHistory()
  const moving = body.steps[index]
  body.steps[index] = body.steps[next]
  body.steps[next] = moving
  try {
    validateDraft()
    recordHistory()
  }
  catch {
    body.steps = before
    toast(tr('illegalMove'))
  }
}
function drag(event: NodeDragEvent) {
  if (selected.value) {
    recordHistory()
    selected.value.editor.positions ||= {}
    selected.value.editor.positions[event.node.id] = event.node.position
    recordHistory()
  }
}
function validInput() {
  for (const key of Array.isArray(selected.value?.spec.inputSchema.required) ? selected.value.spec.inputSchema.required : []) {
    if (input.value[String(key)] == null || input.value[String(key)] === '')
      return false
  }
  return true
}
async function preview() {
  if (previewBusy.value)
    return
  previewBusy.value = true
  try {
    if (!validInput()) {
      toast(tr('typeRequired'))
      await nextTick()
      document.querySelector<HTMLElement>('.preview-composer input,.preview-composer textarea')?.focus()
      return
    }
    await save()
    validateDraft()
    if (!selected.value)
      return
    const submittedInput = copyDocument(input.value)
    const version = await api.preview(selected.value.id)
    runId.value = await api.start(version.id, submittedInput, selected.value.kind === 'agent' && continuousConversation.value ? { conversation: true, ...(conversationId.value ? { conversationId: conversationId.value } : {}) } : undefined)
    void refreshConversations().catch(() => {})
    if (selected.value.kind === 'agent' && continuousConversation.value)
      conversationId.value ||= runId.value
    sentInput.value = submittedInput
    view.value = null
    events.value = []
    answers.clear()
    activity.clear()
    comments.value = {}
    composer.value?.clearText()
    void scrollLatest()
    locationState()
    void observe(runId.value)
  }
  catch (failure) {
    toast(errorMessage(failure))
  }
  finally {
    previewBusy.value = false
  }
}
async function observe(id: string) {
  observer?.abort()
  observer = new AbortController()
  const signal = observer.signal
  function updateView(value: IRunView) {
    if (signal.aborted || runId.value !== id)
      return
    if (view.value && (value.highWaterSeq < view.value.highWaterSeq || (terminal.has(view.value.status) && !terminal.has(value.status))))
      return
    view.value = value
    scrolling.schedule()
  }
  let notifiedFailure = false
  while (!signal.aborted) {
    try {
      const snapshot = await api.run(id)
      if (signal.aborted || runId.value !== id)
        return
      updateView(snapshot)
      if (snapshot.conversationId) {
        conversationId.value = snapshot.conversationId
        if (historyLoadedFor !== id) {
          const turns = await api.conversation(id)
          if (signal.aborted || runId.value !== id)
            return
          conversationTurns.value = turns
          historyLoadedFor = id
          scrolling.schedule()
        }
      }
      if (snapshot.status === 'REJECTED') {
        toast(errorMessage(new Error(snapshot.errorCode || 'EXECUTION_FAILED')))
        return
      }
      await api.events(id, events.value.at(-1)?.seq || 0, signal, (event) => {
        if (signal.aborted || runId.value !== id)
          return
        if (event.seq <= (events.value.at(-1)?.seq || 0))
          return
        answers.accept(event)
        activity.accept(event)
        events.value.push({ ...event, data: {} })
        if (events.value.length > 256)
          events.value.splice(0, events.value.length - 256)
        connected.value = true
        scrolling.schedule()
        if (['run.started', 'run.resumed', 'run.waiting', 'run.completed', 'run.failed', 'node.started', 'node.completed', 'agent.started', 'agent.completed', 'tool.started', 'tool.completed', 'invocation.completed', 'checkpoint.committed'].includes(event.type)) {
          void api.run(id).then((value) => {
            updateView(value)
          }).catch(() => {
          })
        }
      })
      updateView(await api.run(id))
      if (!view.value || signal.aborted)
        return
      if (terminal.has(view.value.status)) {
        connected.value = false
        if (view.value.status === 'FAILED' && !notifiedFailure) {
          toast(errorMessage(new Error(view.value.errorCode || 'EXECUTION_FAILED')))
          notifiedFailure = true
        }
        return
      }
    }
    catch (failure) {
      if (signal.aborted)
        return
      connected.value = false
      if (failure instanceof Error && failure.message.startsWith('AUTH_REQUIRED')) {
        authenticated.value = false
        return
      }
    }
    await new Promise(resolve => setTimeout(resolve, 800))
  }
}
async function approve(interrupt: string, approved: boolean) {
  if (!view.value || approvalBusy.value)
    return
  approvalBusy.value = true
  try {
    await api.approve(runId.value, view.value, [{ interruptId: interrupt, approved, comment: comments.value[interrupt] || '' }], crypto.randomUUID())
    void scrollLatest()
    toast(tr('submitted'), 'info')
  }
  catch (failure) {
    toast(errorMessage(failure))
    view.value = await api.run(runId.value)
  }
  finally {
    approvalBusy.value = false
  }
}
function updateContextPolicy(key: 'triggerTokens' | 'maxInputTokens' | 'keepMessages', value: number) {
  if (!selected.value?.spec.agent)
    return
  selected.value.spec.agent.contextPolicy ||= { triggerTokens: 24000, maxInputTokens: 100000, keepMessages: 4 }
  selected.value.spec.agent.contextPolicy[key] = value
}
function newConversation() {
  observer?.abort()
  conversationId.value = ''
  conversationTurns.value = []
  historyLoadedFor = ''
  runId.value = ''
  blankConversation.value = true
  view.value = null
  events.value = []
  answers.clear()
  activity.clear()
  sentInput.value = null
  locationState()
  void scrollLatest()
}
async function cancelRun() {
  await action(async () => {
    await api.cancel(runId.value, crypto.randomUUID())
    toast(tr('stopped'), 'info')
  })
}
async function logout() {
  await action(async () => {
    await save()
    await api.logout()
    observer?.abort()
    api.selectWorkspace('')
    selected.value = null
    definitions.value = []
    versions.value = []
    view.value = null
    runId.value = ''
    conversationId.value = ''
    conversationTurns.value = []
    historyLoadedFor = ''
    authenticated.value = false
    history.replaceState(null, '', location.pathname)
  })
}
async function sendCode() {
  await action(async () => {
    const result = await api.sendEmailCode(email.value.trim())
    challenge.value = result.challengeId
    cooldown.value = result.retryAfterSeconds
    clearInterval(countdown)
    countdown = setInterval(() => {
      cooldown.value = Math.max(0, cooldown.value - 1)
      if (!cooldown.value)
        clearInterval(countdown)
    }, 1000)
    toast(tr('codeSent'), 'success')
  })
}
async function login() {
  await action(async () => {
    await api.loginEmail(email.value.trim(), code.value, challenge.value)
    api.selectWorkspace('')
    code.value = ''
    await initialize()
  })
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(async () => {
  try {
    await initialize()
  }
  catch {
    authenticated.value = false
  }
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  observer?.abort()
  clearTimeout(autosaveTimer)
  clearInterval(countdown)
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<template>
  <ToastHost />
  <div data-app-surface class="product-app">
    <main v-if="!authenticated" class="product-login">
      <form class="login-card" @submit.prevent="login">
        <a class="brand" href="/rebuild.html">NexusFlow <span class="brand-mark">✳</span></a><h1>{{ tr('loginTitle') }}</h1><p class="muted">
          {{ tr('loginHint') }}
        </p>
        <label class="form__field">{{ tr('email') }}<input v-model="email" class="input" type="email" autocomplete="email" required></label>
        <label class="form__field">{{ tr('code') }}<div class="email-code-row"><input v-model="code" :aria-label="tr('code')" class="input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><button class="btn btn-secondary" type="button" :disabled="busy || !!cooldown" @click="sendCode">{{ cooldown ? `${cooldown}s` : tr('sendCode') }}</button></div></label>
        <button class="btn btn-primary" type="submit" :disabled="busy || !challenge">
          {{ tr('login') }} →
        </button>
      </form>
    </main>
    <template v-else>
      <aside v-if="!selected" class="product-sidebar">
        <a class="brand" href="/rebuild.html" @click.prevent="back">NexusFlow <span class="brand-mark">✳</span></a>
        <label class="workspace-switch"><span class="eyebrow">{{ tr('workspace') }}</span><select v-model="workspace" class="input" :aria-label="tr('workspace')" :disabled="busy" @change="changeWorkspace"><option v-for="space in workspaces" :key="space.id" :value="space.id">{{ space.purpose === 'LEGACY' ? tr('legacy') : space.name }}</option></select></label>
        <nav>
          <button class="product-nav" :class="{ active: !connectionsPage && section === 'agent' }" @click="navigate('agent')">
            <span>✳</span>{{ tr('agents') }}
          </button><button class="product-nav" :class="{ active: !connectionsPage && section === 'workflow' }" @click="navigate('workflow')">
            <span>⌘</span>{{ tr('workflows') }}
          </button>
          <button class="product-nav" :class="{ active: connectionsPage }" @click="router.push({ path: '/connections', query: { workspace } })">
            <span>↗</span>{{ tr('connections') }}
          </button>
        </nav>
        <p class="sidebar-note">
          {{ tr('productNote') }}
        </p><button class="btn btn-quiet account-button" @click="logout">
          ↗ {{ tr('signOut') }}
        </button>
      </aside>
      <main v-if="!selected && connectionsPage" class="product-library">
        <ConnectionManager :key="workspace" :workspace="workspace" :can-manage="workspaces.some(space => space.id === workspace && space.role === 'owner')" @changed="reload" />
      </main>
      <main v-else-if="!selected" class="product-library">
        <header>
          <div>
            <span class="eyebrow">NexusFlow Studio</span><h1>{{ tr(section === 'agent' ? 'agents' : 'workflows') }}</h1><p class="muted">
              {{ tr('subtitle') }}
            </p>
          </div><button class="btn btn-primary" :disabled="busy" @click="openCreate(section)">
            ＋ {{ tr(section === 'agent' ? 'createAgent' : 'createWorkflow') }}
          </button>
        </header>
        <input v-model="search" class="input library-search" type="search" :aria-label="tr('search')" :placeholder="tr('search')">
        <div v-if="library.length" class="resource-grid">
          <button v-for="item in library" :key="item.id" class="resource-card" @click="openDefinition(item)">
            <span class="resource-icon">{{ item.kind === 'agent' ? '✳' : '⌘' }}</span><h2>{{ item.name }}</h2><p>{{ item.kind === 'agent' ? item.spec.agent?.prompt : tr('workflowDescription') }}</p><span class="resource-card-footer">{{ versions.some(version => version.definitionId === item.id) ? tr('published') : tr('draft') }} <span>↗</span></span>
          </button>
        </div>
        <section v-else class="product-empty">
          <span class="empty-symbol">{{ section === 'agent' ? '✳' : '⌘' }}</span><h2>{{ search ? tr('noMatches') : tr(section === 'agent' ? 'noAgents' : 'noWorkflows') }}</h2><p>{{ tr('emptyBody') }}</p><button v-if="!search" class="btn btn-secondary" @click="openCreate(section)">
            {{ tr(section === 'agent' ? 'createAgent' : 'createWorkflow') }} →
          </button>
        </section>
      </main>
      <main v-else class="product-editor">
        <header class="product-editor-header">
          <button class="btn btn-icon back-button" :aria-label="tr('back')" @click="back">
            ←
          </button><div class="document-identity">
            <span class="eyebrow">{{ tr(selected.kind === 'agent' ? 'agent' : 'workflow') }}</span><input v-model="selected.name" class="document-name" :aria-label="tr('name')" maxlength="128">
          </div><button class="save-indicator" :class="`save-indicator--${saveState}`" :disabled="saveState !== 'saveFailed'" @click="action(save)">
            <span />{{ tr(saveState) }}
          </button><span class="version-indicator">{{ ownVersions.length ? `${tr('published')} v${ownVersions[0].ordinal}` : tr('draft') }}</span><button class="btn btn-primary" :disabled="busy" :title="tr('publishHint')" @click="publish">
            {{ busy ? tr('publishing') : tr('publish') }} ↗
          </button>
        </header>
        <WorkbenchSplit :kind="selected.kind">
          <template #configuration>
            <section v-if="selected.spec.agent" class="agent-configuration">
              <header class="pane-heading">
                <h2>{{ tr('configure') }}</h2><span class="eyebrow">{{ tr('agent') }}</span>
              </header><div class="configuration-scroll">
                <label class="form__field">{{ tr('model') }}<select v-model="selected.spec.agent.modelConnectionRef" class="input" :aria-label="tr('model')"><option v-if="!availableModels.length" value="validation-model" disabled>{{ tr('modelEmpty') }}</option><option v-for="model in availableModels" :key="model.id" :value="model.id">{{ tr(model.mode === 'live' ? 'liveModel' : 'fixtureModel') }}</option></select></label>
                <label class="form__field prompt-field"><span>{{ tr('prompt') }}</span><textarea v-model="selected.spec.agent.prompt" class="input product-prompt" rows="10" maxlength="16000" :placeholder="tr('promptHint')" /><small class="field-hint">{{ tr('promptHint') }}</small></label>
                <section class="capability-section">
                  <header>
                    <h3>{{ tr('tools') }}</h3><button class="btn btn-quiet" @click="modal = 'tools'">
                      ＋ {{ tr('addTool') }}
                    </button>
                  </header><p class="muted">
                    {{ tr(selected.spec.agent.toolPolicy === 'auto' ? 'autoToolsHint' : 'toolHint') }}
                  </p>
                  <div v-if="selected.spec.agent.toolPolicy === 'auto'" class="tool-row">
                    <span class="tool-icon">⌘</span><div><strong>{{ tr('autoTools') }}</strong><small>{{ capabilities?.tools.length || 0 }} {{ tr('availableTools') }}</small></div><button class="btn btn-quiet" @click="router.push({ path: '/connections', query: { workspace } })">
                      {{ tr('manageConnections') }} ↗
                    </button>
                  </div>
                  <details class="product-disclosure">
                    <summary>{{ tr('advancedToolScope') }}</summary><label class="connection-enable"><input type="checkbox" :checked="selected.spec.agent.toolPolicy === 'auto'" @change="selected.spec.agent.toolPolicy = ($event.target as HTMLInputElement).checked ? 'auto' : 'restricted'">{{ tr('autoTools') }}</label><p class="muted">
                      {{ tr('restrictedToolsHint') }}
                    </p>
                    <template v-if="selected.spec.agent.toolPolicy !== 'auto'">
                      <label v-for="tool in capabilities?.tools.filter(item => item.category === 'mcp')" :key="tool.name" class="connection-enable"><input type="checkbox" :checked="selected.spec.agent.remoteTools?.includes(tool.name) || false" @change="selected.spec.agent.remoteTools = ($event.target as HTMLInputElement).checked ? [...(selected.spec.agent.remoteTools || []), tool.name] : (selected.spec.agent.remoteTools || []).filter(name => name !== tool.name)">{{ tool.displayName }}</label>
                    </template>
                  </details><div v-for="tool in selected.spec.agent.toolPolicy === 'auto' ? [] : selected.spec.agent.tools" :key="tool" class="tool-row">
                    <span class="tool-icon">⌘</span><div><strong>{{ tr(tool) }}</strong><small>{{ tr(`${tool}Hint`) }}</small></div><span class="tiny-badge">{{ tr('readOnly') }}</span><button class="btn btn-icon" :aria-label="tr('removeField')" @click="selected.spec.agent.tools = selected.spec.agent.tools.filter(item => item !== tool)">
                      ×
                    </button>
                  </div>
                  <div v-for="tool in selected.spec.agent.executionTools || []" :key="tool.name" class="execution-tool-card">
                    <div class="tool-row">
                      <span class="tool-icon">{{ versions.find(version => version.id === tool.versionRef)?.spec.kind === 'workflow' ? '⌘' : '✳' }}</span><div><strong>{{ versions.find(version => version.id === tool.versionRef)?.name || tr('publishedExecution') }}</strong><small>{{ tr('fixedVersion') }} v{{ versions.find(version => version.id === tool.versionRef)?.ordinal }}</small></div><button class="btn btn-icon" :aria-label="tr('removeField')" @click="selected.spec.agent.executionTools = selected.spec.agent.executionTools?.filter(item => item.name !== tool.name)">
                        ×
                      </button>
                    </div>
                    <label class="form__field">{{ tr('executionToolUsage') }}<textarea v-model="tool.description" class="input" rows="2" maxlength="500" /></label>
                    <small class="muted">{{ tr('executionToolMappingHint') }}</small>
                  </div>
                </section>
                <details class="product-disclosure context-settings">
                  <summary>{{ tr('contextSettings') }}</summary><label class="connection-enable"><input v-model="continuousConversation" type="checkbox" :disabled="previewBusy || !!view && !terminal.has(view.status)" @change="newConversation">{{ tr('continuousConversation') }}</label><p class="muted">
                    {{ tr('contextSettingsHint') }}
                  </p>
                  <label class="form__field">{{ tr('contextTrigger') }}<input class="input" type="number" min="256" max="128000" :value="selected.spec.agent.contextPolicy?.triggerTokens ?? 24000" @change="updateContextPolicy('triggerTokens', Number(($event.target as HTMLInputElement).value))"></label>
                  <label class="form__field">{{ tr('contextMaximum') }}<input class="input" type="number" min="1024" max="256000" :value="selected.spec.agent.contextPolicy?.maxInputTokens ?? 100000" @change="updateContextPolicy('maxInputTokens', Number(($event.target as HTMLInputElement).value))"></label>
                  <label class="form__field">{{ tr('contextRecent') }}<input class="input" type="number" min="4" max="40" :value="selected.spec.agent.contextPolicy?.keepMessages ?? 4" @change="updateContextPolicy('keepMessages', Number(($event.target as HTMLInputElement).value))"></label>
                </details>
                <details class="product-disclosure">
                  <summary>{{ tr('parameters') }}</summary><p class="muted">
                    {{ tr('schemaHint') }}
                  </p><h3>{{ tr('inputFields') }}</h3><SchemaEditor v-model="selected.spec.inputSchema" /><h3>{{ tr('outputFields') }}</h3><SchemaEditor v-model="selected.spec.outputSchema" />
                </details>
                <details class="product-disclosure">
                  <summary>{{ tr('limits') }}</summary><p v-if="capabilities?.tokenReservationPolicy === 'unlimited'" class="muted">
                    {{ tr('tokensUnlimited') }}
                  </p><label v-for="key in editableBudgetKeys" :key="key" class="form__field">{{ tr(String(key)) }}<input v-model.number="selected.spec.budget[key]" class="input" type="number" :min="budgetLimits[key].min" :max="budgetLimits[key].max"></label>
                </details>
              </div>
            </section>
            <section v-else class="workflow-design">
              <header class="pane-heading">
                <h2>{{ tr('configure') }}</h2><div class="history-actions">
                  <button class="btn btn-icon" :aria-label="tr('undo')" :title="tr('undo')" :disabled="!canUndo" @click="undo">
                    ↶
                  </button><button class="btn btn-icon" :aria-label="tr('redo')" :title="tr('redo')" :disabled="!canRedo" @click="redo">
                    ↷
                  </button>
                </div><button class="btn btn-quiet" @click="modal = 'settings'">
                  {{ tr('workflowSettings') }}
                </button><button class="btn btn-quiet" @click="addStep(selected.spec.body!.id)">
                  ＋ {{ tr('addStep') }}
                </button>
              </header><WorkflowCanvas :spec="selected.spec" :versions="versions" :positions="selected.editor.positions || {}" :selected="selectedNodeId" @select="selectedNodeId = $event" @add="addStep" @drag="drag" /><NodeConfiguration v-if="currentNode" :node="currentNode" :spec="selected.spec" :versions="versions" :tools="capabilities?.tools.filter(tool => tool.category !== 'mcp') || []" @change="updateNode" @schema="(kind, value) => { if (selected) selected.spec[kind] = value }" @select-agent="replaceExecution" @close="selectedNodeId = ''" @remove="removeNode" @move="moveNode" />
            </section>
          </template>
          <template #preview>
            <section class="product-preview">
              <header class="pane-heading">
                <div><h2>{{ tr('preview') }}</h2><small class="muted">{{ tr('previewHint') }}</small></div><button v-if="selected.kind === 'agent'" class="btn btn-quiet" @click="memoryOpen = true">
                  {{ tr('longTermMemory') }}
                </button><button v-if="selected.kind === 'agent' && continuousConversation" class="btn btn-quiet" :disabled="previewBusy || !!view && !terminal.has(view.status)" @click="newConversation">
                  ＋ {{ tr('newConversation') }}
                </button><span v-if="view" class="run-status" :class="`run-status--${view.status}`" data-testid="run-status">{{ tr(`statuses.${view.status}`) }}</span>
              </header>
              <label class="saved-conversations">
                <span>{{ tr('savedConversations') }}</span>
                <select :aria-label="tr('savedConversations')" :value="runId" :disabled="previewBusy || !!view && !terminal.has(view.status)" @focus="refreshConversations().catch(error => toast(errorMessage(error)))" @change="selectConversation($event).catch(error => toast(errorMessage(error)))">
                  <option value="">{{ tr('newConversation') }}</option>
                  <option v-for="entry in savedConversations" :key="entry.runId" :value="entry.runId">{{ entry.title || tr('conversation') }} · {{ entry.conversationId ? tr('savedChat') : tr('independentRun') }} · {{ entry.updatedAt.slice(0, 16) }}</option>
                </select>
              </label>
              <div v-if="view || previewBusy" class="preview-live-status" role="status" aria-live="polite">
                <span v-if="view && !terminal.has(view.status) && view.status !== 'WAITING'" class="pulse-dot" /><span>{{ activityPanel?.headline || tr('preparingRun') }}</span><small class="connection-state">{{ view && terminal.has(view.status) ? tr('finished') : connected ? tr('connected') : tr('reconnecting') }}</small>
              </div>
              <div class="preview-body">
                <div ref="previewScroll" class="preview-scroll" tabindex="0" :aria-label="tr('conversation')" @scroll="scrolling.scroll" @wheel.passive="scrolling.wheel" @keydown="scrolling.key" @touchstart.passive="scrolling.touchStart" @touchmove.passive="scrolling.touchMove" @pointerdown="scrolling.pointerDown" @pointerup="scrolling.pointerUp" @pointercancel="scrolling.pointerUp" @pointerleave="scrolling.pointerUp">
                  <div ref="previewContent" class="conversation-content">
                    <section v-for="turn in conversationTurns" :key="turn.runId" class="conversation-turn">
                      <article class="conversation-input">
                        <span class="eyebrow">{{ tr('you') }}</span><ResultView :value="turn.input" />
                      </article>
                      <article class="conversation-answer">
                        <header><strong>✳ {{ selected.name }}</strong></header><ResultView :value="turn.output" />
                      </article>
                    </section>

                    <template v-if="view">
                      <ConversationMessages :input="view.input || sentInput || input" :messages="answers.messages.value" :view="view" :name="selected.name" :trimmed="answers.trimmed.value">
                        <ExecutionActivity ref="activityPanel" :entries="activity.entries.value" :view="view" :versions="versions" :spec="selected.spec" :name="selected.name" />
                      </ConversationMessages>
                      <section v-for="item in view.status === 'WAITING' ? view.interrupts : []" :key="item.id" class="approval-card">
                        <span class="eyebrow">{{ tr('nodes.human') }}</span><h3>{{ item.value.title }}</h3><p v-if="item.value.prompt">
                          {{ item.value.prompt }}
                        </p><ResultView v-if="Object.keys(item.value.input).length" :value="item.value.input" /><small class="muted">{{ tr('approvalWaiting') }}</small><label class="form__field">{{ tr('approvalComment') }}<textarea v-model="comments[item.id]" class="input" rows="2" maxlength="2000" /></label><div class="approval-buttons">
                          <button class="btn btn-primary" :disabled="approvalBusy" @click="approve(item.id, true)">
                            {{ tr('approve') }}
                          </button><button class="btn btn-secondary" :disabled="approvalBusy" @click="approve(item.id, false)">
                            {{ tr('reject') }}
                          </button>
                        </div>
                      </section>
                      <section v-if="view.status === 'SUCCEEDED'" class="preview-answer" data-testid="run-output">
                        <div class="answer-heading">
                          <span>✳</span><strong>{{ selected.name }}</strong>
                        </div><ResultView :value="view.output" />
                      </section><section v-else-if="terminal.has(view.status)" class="preview-outcome">
                        <h3>{{ tr(`statuses.${view.status}`) }}</h3><p>{{ view.errorCode ? errorMessage(new Error(view.errorCode)) : tr('emptyResult') }}</p>
                      </section>

                      <SourceReferences v-if="terminal.has(view.status)" :invocations="view.invocations" />
                      <p v-if="view.usage && terminal.has(view.status)" class="run-usage">
                        {{ view.usage.modelCalls }} {{ tr('timeModel') }} · {{ view.usage.toolCalls }} {{ tr('timeTool') }}
                      </p>
                    </template><section v-else-if="previewBusy || runId" class="preview-loading">
                      <span class="pulse-dot" />{{ tr('preparingRun') }}
                    </section><section v-else class="preview-empty">
                      <span>✳</span><h3>{{ tr('noRun') }}</h3><p>{{ tr('noRunHint') }}</p>
                    </section>
                  </div>
                </div>
                <button v-if="!scrolling.following.value" class="btn btn-quiet scroll-latest" @click="scrollLatest">
                  ↓ {{ tr('backToBottom') }}
                </button>
              </div>
              <ChatComposer ref="composer" v-model="input" :schema="selected.spec.inputSchema" :busy="previewBusy" :running="!!(view && !terminal.has(view.status))" :stopping="busy" @submit="preview" @cancel="cancelRun" />
            </section>
          </template>
        </WorkbenchSplit>
      </main>
    </template>
  </div>
  <MemoryManager v-if="memoryOpen && selected" :definition-id="selected.id" @close="memoryOpen = false" />
  <ProductModal v-if="modal === 'create'" :title="tr(newKind === 'agent' ? 'createAgent' : 'createWorkflow')" @close="modal = ''">
    <form id="create-resource" @submit.prevent="createDefinition">
      <p class="muted">
        {{ tr('description') }}
      </p><label class="form__field">{{ tr('name') }}<input v-model="newName" class="input" :placeholder="tr('namePlaceholder')" maxlength="128" required></label>
    </form><template #footer>
      <button class="btn btn-secondary" @click="modal = ''">
        {{ tr('cancel') }}
      </button><button class="btn btn-primary" form="create-resource" type="submit" :disabled="busy">
        {{ tr('create') }} →
      </button>
    </template>
  </ProductModal>
  <ProductModal v-if="modal === 'palette'" :title="tr('chooseStep')" @close="modal = ''">
    <div class="node-palette">
      <button v-for="type in ['agent_call', 'workflow_call', 'transform', 'tool', 'branch', 'parallel', 'human']" :key="type" class="palette-option" @click="insert(type)">
        <span>{{ type === 'agent_call' ? '✳' : type === 'parallel' ? '⑂' : '◇' }}</span><div><strong>{{ tr(`nodes.${type}`) }}</strong><small>{{ tr(`nodeHints.${type}`) }}</small></div><span>＋</span>
      </button>
    </div>
  </ProductModal>
  <ProductModal v-if="modal === 'agent'" :title="tr(pickerKind === 'workflow' ? 'selectWorkflow' : 'selectAgent')" wide @close="modal = ''">
    <div class="resource-picker">
      <aside>
        <button class="btn btn-primary" @click="createAgentAndReturn">
          ＋ {{ tr('createNew') }}
        </button><p>{{ tr(pickerKind === 'workflow' ? 'selectWorkflowHint' : 'selectAgentHint') }}</p>
      </aside><section>
        <input v-model="resourceSearch" class="input" type="search" :aria-label="tr('search')" :placeholder="tr('search')"><button v-for="version in compatibleAgents" :key="version.id" class="picker-resource" @click="attachAgent(version)">
          <span>✳</span><div><strong>{{ version.name }}</strong><small>{{ tr('published') }} v{{ version.ordinal }}</small></div><span>{{ tr(pickerTarget === 'tool' ? 'addTool' : 'addToWorkflow') }} →</span>
        </button><div v-if="!compatibleAgents.length" class="picker-empty">
          <span>✳</span><h3>{{ tr('noMatches') }}</h3><p>{{ tr(pickerKind === 'workflow' ? 'selectWorkflowHint' : 'selectAgentHint') }}</p>
        </div>
      </section>
    </div>
  </ProductModal>
  <ProductModal v-if="modal === 'settings' && selected" :title="tr('workflowSettings')" wide @close="modal = ''">
    <h3>{{ tr('sharedState') }}</h3><StateEditor :model-value="selected.spec.state?.channels || {}" @update:model-value="updateChannels" />
    <details class="product-disclosure">
      <summary>{{ tr('limits') }}</summary><p v-if="capabilities?.tokenReservationPolicy === 'unlimited'" class="muted">
        {{ tr('tokensUnlimited') }}
      </p><label v-for="key in editableBudgetKeys" :key="key" class="form__field">{{ tr(String(key)) }}<input v-model.number="selected.spec.budget[key]" class="input" type="number" :min="budgetLimits[key].min" :max="budgetLimits[key].max"></label>
    </details>
  </ProductModal>
  <ProductModal v-if="modal === 'tools'" :title="tr('selectTool')" @close="modal = ''">
    <div class="tool-options">
      <button v-for="kind in (['workflow', 'agent'] as const)" :key="kind" class="palette-option" @click="openExecutionPicker(kind, 'tool')">
        <span>{{ kind === 'workflow' ? '⌘' : '✳' }}</span><div><strong>{{ tr(kind === 'workflow' ? 'selectWorkflow' : 'selectAgent') }}</strong><small>{{ tr('publishedExecutionToolHint') }}</small></div><span>＋</span>
      </button>
      <template v-for="group in ['research', 'text']" :key="group">
        <h3 class="tool-category">
          {{ tr(group === 'research' ? 'researchTools' : 'textTools') }}
        </h3>
        <button v-for="tool in capabilities?.tools.filter(item => (item.category || 'text') === group)" :key="tool.name" class="palette-option" :disabled="selected?.spec.agent?.tools.includes(tool.name)" @click="selected?.spec.agent?.tools.push(tool.name); modal = ''">
          <span>{{ group === 'research' ? '↗' : '⌘' }}</span><div><strong>{{ tr(tool.name) }}</strong><small>{{ tr(`${tool.name}Hint`) }}</small></div><span>＋</span>
        </button>
      </template>
      <p class="muted tool-picker-note">
        {{ tr('publicToolsNote') }}
      </p>
    </div>
  </ProductModal>
</template>
