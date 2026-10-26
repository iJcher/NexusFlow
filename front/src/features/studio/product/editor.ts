import type { IBinding, IDefinition, IExecutionNode, IExecutionSequence, IExecutionSpec, IVersion } from '@/types/execution-v2.types'

export interface IBindingOption {
  id: string
  label: string
  binding: IBinding
  schemaType?: string
}
export type Translate = (key: string) => string
export const budgetLimits = {
  maxModelCalls: { min: 1, max: 20 },
  maxToolCalls: { min: 1, max: 50 },
  maxTokens: { min: 128, max: 100000 },
  timeoutSeconds: { min: 5, max: 600 },
}
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
export function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}
export function scalar(value: string, type: string): unknown {
  return type === 'boolean' ? value === 'true' : type === 'number' ? Number(value) : value
}
export function title(key: string, schema: Record<string, unknown>, t: Translate) {
  return String(schema.title || (['context', 'request', 'summary', 'text', 'approved', 'comment', 'result', 'characters', 'words', 'lines', 'branches', 'selected', 'value'].includes(key) ? t(`fields.${key}`) : key))
}
export function initialSpec(kind: 'workflow' | 'agent', model: string, t: Translate): IExecutionSpec {
  const spec: IExecutionSpec = { dslVersion: '2.0', kind, definitionKey: uid(kind).replace(/_/g, '-'), inputSchema: { type: 'object', properties: { request: { type: 'string', title: t('fields.request'), maxLength: 4000 } }, required: ['request'], additionalProperties: false }, outputSchema: { type: 'object' }, budget: { maxModelCalls: 8, maxToolCalls: 12, maxTokens: 60000, timeoutSeconds: 300 } }
  if (kind === 'agent') {
    spec.outputSchema = { type: 'object', properties: { summary: { type: 'string', title: t('fields.summary') } }, required: ['summary'], additionalProperties: false }
    spec.agent = { modelConnectionRef: model, prompt: t('defaultPrompt'), tools: [], toolPolicy: 'auto' }
  }
  else {
    spec.state = { channels: { request: { schema: { type: 'string', title: t('fields.request') }, reducer: 'last_value' } } }
    spec.body = { id: 'main', type: 'sequence', steps: [{ id: 'input', type: 'input', write: { request: { source: 'input', path: '/request' } } }, { id: 'output', type: 'output', value: { source: 'input', path: '' } }] }
  }
  return spec
}
export function sequences(body: IExecutionSequence): IExecutionSequence[] {
  return [body, ...body.steps.flatMap(node => [...(node.branches || []), ...(node.cases || []).map(item => item.body), ...(node.default ? [node.default] : [])].flatMap(sequences))]
}
export function allNodes(spec: IExecutionSpec): IExecutionNode[] {
  return spec.body ? sequences(spec.body).flatMap(item => item.steps) : []
}
export function nodeLabel(node: IExecutionNode, versions: IVersion[], t: Translate) {
  return node.label || (node.type === 'human' ? node.title : node.type === 'tool' && node.toolRef ? t(node.toolRef) : ['agent_call', 'workflow_call'].includes(node.type) ? versions.find(item => item.id === node.versionRef)?.name : '') || t(`nodes.${node.type}`)
}
export function makeNode(type: string, t: Translate): IExecutionNode {
  const node: IExecutionNode = { id: uid(type), type }
  if (type === 'transform')
    node.input = { summary: { source: 'input', path: '/request' } }
  if (type === 'tool') {
    node.toolRef = 'inspect_text'
    node.input = { text: { source: 'input', path: '/request' } }
  }
  if (type === 'human') {
    node.title = t('approvalTitle')
    node.prompt = ''
    node.input = { request: { source: 'input', path: '/request' } }
  }
  if (type === 'parallel')
    node.branches = [1, 2].map(() => ({ id: uid('path'), type: 'sequence', steps: [] }))
  if (type === 'branch') {
    node.cases = [{ when: { left: { source: 'input', path: '/request' }, operator: 'contains', right: '' }, body: { id: uid('matched'), type: 'sequence', steps: [] } }]
    node.default = { id: uid('otherwise'), type: 'sequence', steps: [] }
  }
  return node
}
export function sameBinding(left: IBinding, right: IBinding) {
  return left.source === right.source && (left.path || '') === (right.path || '') && left.nodeId === right.nodeId
}
export function visibleNodes(spec: IExecutionSpec, selected: string): IExecutionNode[] {
  function visit(body: IExecutionSequence, inherited: IExecutionNode[]): IExecutionNode[] | null {
    const before = [...inherited]
    for (const node of body.steps) {
      if (node.id === selected)
        return before
      for (const nested of [...(node.branches || []), ...(node.cases || []).map(item => item.body), ...(node.default ? [node.default] : [])]) {
        const found = visit(nested, before)
        if (found)
          return found
      }
      before.push(node)
    }
    return null
  }
  return spec.body ? visit(spec.body, []) || [] : []
}
export function outputSchema(node: IExecutionNode, versions: IVersion[]): Record<string, unknown> {
  if (['agent_call', 'workflow_call'].includes(node.type))
    return versions.find(item => item.id === node.versionRef)?.spec.outputSchema || { type: 'object' }
  if (node.type === 'human')
    return { type: 'object', properties: { approved: { type: 'boolean' }, comment: { type: 'string' } } }
  if (node.type === 'tool' && ['web_read', 'github_search', 'github_repository'].includes(node.toolRef || ''))
    return { type: 'object', properties: { ok: { type: 'boolean' }, sourceUrl: { type: 'string' }, retrievedAt: { type: 'string' }, content: { type: 'string' }, items: { type: 'array', items: { type: 'object' } }, repository: { type: 'object' }, error: { type: 'object' } } }
  if (node.type === 'tool')
    return { type: 'object', properties: { characters: { type: 'integer' }, words: { type: 'integer' }, ...(node.toolRef === 'inspect_text' ? { lines: { type: 'integer' } } : {}) } }
  if (node.type === 'branch') {
    const bodies = [...(node.cases || []).map(item => item.body), ...(node.default ? [node.default] : [])]
    const schemas = bodies.map(body => body.steps.length ? outputSchema(body.steps.at(-1)!, versions) : { type: 'object' })
    const common = Object.fromEntries(Object.entries(record(schemas[0]?.properties)).filter(([key]) => schemas.every(schema => key in record(schema.properties))))
    return { type: 'object', properties: { selected: { type: 'string' }, result: { type: 'object', properties: common } } }
  }
  if (node.type === 'parallel')
    return { type: 'object', properties: { branches: { type: 'object', properties: Object.fromEntries((node.branches || []).map(branch => [branch.id, branch.steps.length ? outputSchema(branch.steps.at(-1)!, versions) : { type: 'object' }])) } } }
  return { type: 'object', properties: Object.fromEntries(Object.keys(node.input || {}).map(key => [key, {}])) }
}
export function bindingOptions(spec: IExecutionSpec, node: IExecutionNode, versions: IVersion[], t: Translate, includeOutput = false): IBindingOption[] {
  const options: IBindingOption[] = []
  function add(schema: Record<string, unknown>, binding: IBinding, label: string, depth = 0) {
    options.push({ id: `${binding.source}|${binding.nodeId || ''}|${binding.path}`, label, binding, schemaType: String(schema.type || '') })
    if (depth > 3)
      return
    for (const [key, raw] of Object.entries(record(schema.properties))) {
      const child = record(raw)
      const path = `${binding.path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`
      add(child, { ...binding, path }, `${label} › ${title(key, child, t)}`, depth + 1)
    }
  }
  add(spec.inputSchema, { source: 'input', path: '' }, t('inputValues'))
  for (const [key, channel] of Object.entries(spec.state?.channels || {}))
    add(channel.schema, { source: 'state', path: `/${key}` }, `${t('sharedState')} › ${title(key, channel.schema, t)}`)
  for (const previous of visibleNodes(spec, node.id)) {
    if (previous.type !== 'output')
      add(previous.type === 'input' ? spec.inputSchema : outputSchema(previous, versions), { source: 'node_output', nodeId: previous.id, path: '' }, nodeLabel(previous, versions, t))
  }
  if (includeOutput)
    add(node.type === 'input' ? spec.inputSchema : outputSchema(node, versions), { source: 'output', path: '' }, t('thisResult'))
  return options
}
export function signature(definition: IDefinition | null) {
  return definition ? JSON.stringify({ name: definition.name, spec: definition.spec, editor: definition.editor }) : ''
}
export function referenced(spec: IExecutionSpec, identity: string, excluded = new Set<string>()) {
  return allNodes(spec).filter(node => !excluded.has(node.id)).some(node => [...Object.values(node.input || {}), ...Object.values(node.write || {}), ...(node.value ? [node.value] : []), ...(node.cases || []).map(item => item.when.left)].some(binding => binding.source === 'node_output' && binding.nodeId === identity))
}
export function bindingSchema(spec: IExecutionSpec, binding: IBinding, versions: IVersion[]) {
  const node = allNodes(spec).find(item => item.id === binding.nodeId)
  let schema: Record<string, unknown> = binding.source === 'input' ? spec.inputSchema : binding.source === 'state' ? { type: 'object', properties: Object.fromEntries(Object.entries(spec.state?.channels || {}).map(([key, value]) => [key, value.schema])) } : node ? node.type === 'input' ? spec.inputSchema : outputSchema(node, versions) : {}
  for (const key of (binding.path || '').split('/').slice(1))
    schema = record(record(schema.properties)[key.replace(/~1/g, '/').replace(/~0/g, '~')])
  return schema
}
