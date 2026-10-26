import type { ICapabilities, IConversationTurn, IDefinition, IExecutionEvent, IExecutionSpec, IRunView, IVersion, IWorkspace } from '@/types/execution-v2.types'

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_RESPONSE')
  return value as Record<string, unknown>
}
function isSpec(value: unknown): value is IExecutionSpec {
  const spec = object(value)
  if (!['workflow', 'agent'].includes(String(spec.kind)) || typeof spec.dslVersion !== 'string' || typeof spec.definitionKey !== 'string')
    return false
  object(spec.inputSchema)
  object(spec.outputSchema)
  const budget = object(spec.budget)
  if (!['maxModelCalls', 'maxToolCalls', 'maxTokens', 'timeoutSeconds'].every(key => typeof budget[key] === 'number'))
    return false
  if (spec.kind === 'workflow') {
    const body = object(spec.body)
    return typeof body.type === 'string' && typeof body.id === 'string' && Array.isArray(body.steps) && body.steps.every((item: unknown) => {
      const node = object(item)
      return typeof node.id === 'string' && typeof node.type === 'string'
    })
  }
  const agent = object(spec.agent)
  return typeof agent.prompt === 'string' && typeof agent.modelConnectionRef === 'string' && Array.isArray(agent.tools) && agent.tools.every(item => typeof item === 'string')
}
function definition(value: unknown): IDefinition {
  const item = object(value)
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.revision !== 'number' || !isSpec(item.spec))
    throw new Error('INVALID_DEFINITION_RESPONSE')
  return { id: item.id, name: item.name, kind: item.spec.kind, revision: item.revision, spec: item.spec, editor: object(item.editor) }
}
function version(value: unknown): IVersion {
  const item = object(value)
  if (typeof item.id !== 'string' || typeof item.definitionId !== 'string' || typeof item.ordinal !== 'number' || typeof item.hash !== 'string' || !isSpec(item.spec))
    throw new Error('INVALID_VERSION_RESPONSE')
  return { id: item.id, definitionId: item.definitionId, ordinal: item.ordinal, hash: item.hash, spec: item.spec, name: typeof item.name === 'string' ? item.name : undefined, kind: typeof item.kind === 'string' ? item.kind : undefined, manifest: item.manifest ? object(item.manifest) : undefined }
}
export function event(value: unknown): IExecutionEvent {
  const item = object(value)
  if (typeof item.eventId !== 'string' || typeof item.runId !== 'string' || typeof item.seq !== 'number' || typeof item.type !== 'string' || typeof item.commitStatus !== 'string' || typeof item.attemptId !== 'string' || typeof item.time !== 'string')
    throw new Error('INVALID_EVENT_RESPONSE')
  if (!['ROOT', 'INVOCATION'].includes(String(item.scope)) || item.payloadVersion !== '2.0')
    throw new Error('INVALID_EVENT_VERSION')
  return { eventId: item.eventId, runId: item.runId, seq: item.seq, type: item.type, commitStatus: item.commitStatus, attemptId: item.attemptId, time: item.time, invocationId: typeof item.invocationId === 'string' ? item.invocationId : null, parentInvocationId: typeof item.parentInvocationId === 'string' ? item.parentInvocationId : null, scope: String(item.scope), checkpointRef: typeof item.checkpointRef === 'string' ? item.checkpointRef : null, payloadVersion: item.payloadVersion, nodeId: typeof item.nodeId === 'string' ? item.nodeId : null, data: object(item.data) }
}
let workspaceId = ''
export async function request(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<unknown> {
  const response = await fetch(`/api/v2${path}`, { method, credentials: 'same-origin', headers: { ...(workspaceId ? { 'X-Workspace-ID': workspaceId } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  const value: unknown = await response.json()
  if (!response.ok) {
    const error = object(value)
    throw new Error(`${String(error.code || 'REQUEST_FAILED')}${error.path ? ` · ${String(error.path)}` : ''}`)
  }
  return value
}
export class ExecutionService {
  static async memories(id: string) {
    const data = object(await request('GET', `/definitions/${id}/memories`))
    if (!Array.isArray(data.items))
      throw new Error('INVALID_MEMORY_RESPONSE')
    return data.items.map((raw: unknown) => {
      const item = object(raw)
      return { id: String(item.id), content: String(item.content), source: String(item.source) }
    })
  }

  static saveMemory(id: string, content: string) { return request('POST', `/definitions/${id}/memories`, { content, confirmed: true, source: 'user_explicit' }) }
  static deleteMemory(id: string, key: string) { return request('DELETE', `/definitions/${id}/memories/${key}`) }

  static async sendEmailCode(email: string) {
    const value = object(await request('POST', '/auth/email/code', { email }))
    if (typeof value.challengeId !== 'string' || typeof value.retryAfterSeconds !== 'number')
      throw new Error('INVALID_AUTH_RESPONSE')
    return { challengeId: value.challengeId, retryAfterSeconds: value.retryAfterSeconds }
  }

  static loginEmail(email: string, code: string, challengeId: string) { return request('POST', '/auth/email/login', { email, code, challengeId }) }
  static selectWorkspace(id: string) { workspaceId = id }
  static async workspaces(): Promise<IWorkspace[]> {
    const value = await request('GET', '/workspaces')
    if (!Array.isArray(value))
      throw new Error('INVALID_WORKSPACES')
    return value.map((raw: unknown) => {
      const item = object(raw)
      return { id: String(item.id), name: String(item.name), purpose: String(item.purpose), role: String(item.role) }
    })
  }

  static login(username: string, password: string) { return request('POST', '/auth/login', { username, password }) }
  static session() { return request('GET', '/auth/session') }
  static logout() { return request('POST', '/auth/logout') }
  static async definitions(): Promise<IDefinition[]> {
    const data = await request('GET', '/definitions')
    if (!Array.isArray(data))
      throw new Error('INVALID_LIST')
    return data.map(definition)
  }

  static async versions(): Promise<IVersion[]> {
    const data = await request('GET', '/versions')
    if (!Array.isArray(data))
      throw new Error('INVALID_LIST')
    return data.map(version)
  }

  static async create(name: string, spec: IExecutionSpec) { return definition(await request('POST', '/definitions', { name, kind: spec.kind, spec, editor: {} })) }
  static async save(item: IDefinition) { return definition(await request('PUT', `/definitions/${item.id}/draft`, { name: item.name, revision: item.revision, spec: item.spec, editor: item.editor })) }
  static validate(id: string) { return request('POST', `/definitions/${id}/validate`) }
  static async publish(id: string) { return version(await request('POST', `/definitions/${id}/publish`)) }
  static async preview(id: string) { return version(await request('POST', `/definitions/${id}/preview`)) }
  static async capabilities(): Promise<ICapabilities> {
    const data = object(await request('GET', '/capabilities'))
    if (!Array.isArray(data.nodes) || !Array.isArray(data.disabledNodes) || !Array.isArray(data.models) || !Array.isArray(data.tools))
      throw new Error('INVALID_CAPABILITIES')
    return {
      bundleDigest: typeof data.bundleDigest === 'string' ? data.bundleDigest : undefined,
      tokenReservationPolicy: data.tokenReservationPolicy === 'unlimited' ? 'unlimited' : 'definition',
      nodes: data.nodes.map((item: unknown) => {
        const node = object(item)
        return { type: String(node.type), enabled: node.enabled === true }
      }),
      disabledNodes: data.disabledNodes.map(String),
      models: data.models.map((item: unknown) => {
        const model = object(item)
        return { id: String(model.id), mode: String(model.mode), available: model.available !== false }
      }),
      tools: data.tools.map((item: unknown) => {
        const tool = object(item)
        return { name: String(tool.name), displayName: typeof tool.displayName === 'string' ? tool.displayName : undefined, readOnly: tool.readOnly === true, description: typeof tool.description === 'string' ? tool.description : undefined, category: typeof tool.category === 'string' ? tool.category : undefined, version: typeof tool.version === 'string' ? tool.version : undefined, inputSchema: tool.inputSchema ? object(tool.inputSchema) : undefined, allowedHosts: Array.isArray(tool.allowedHosts) ? tool.allowedHosts.map(String) : undefined }
      }),
    }
  }

  static async start(versionId: string, input: Record<string, unknown>, conversation?: { conversation: true, conversationId?: string }) {
    const receipt = object(await request('POST', '/runs', { versionId, input, ...conversation }, { 'Idempotency-Key': crypto.randomUUID() }))
    if (typeof receipt.runId !== 'string')
      throw new Error('INVALID_RUN_RECEIPT')
    return receipt.runId
  }

  static async conversation(id: string): Promise<IConversationTurn[]> {
    const data = await request('GET', `/runs/${id}/conversation`)
    if (!Array.isArray(data))
      throw new Error('INVALID_CONVERSATION_RESPONSE')
    return data.map((raw: unknown) => {
      const item = object(raw)
      return { runId: String(item.runId), input: object(item.input), output: item.output, status: String(item.status) }
    })
  }

  static async conversations(id: string) {
    const data = await request('GET', `/definitions/${id}/conversations`)
    if (!Array.isArray(data))
      throw new Error('INVALID_CONVERSATION_RESPONSE')
    return data.map((raw: unknown) => {
      const item = object(raw)
      return { runId: String(item.runId), conversationId: typeof item.conversationId === 'string' ? item.conversationId : undefined, title: String(item.title), updatedAt: String(item.updatedAt) }
    })
  }

  static async run(id: string): Promise<IRunView> {
    const data = object(await request('GET', `/runs/${id}`))
    if (typeof data.runId !== 'string' || typeof data.status !== 'string' || typeof data.highWaterSeq !== 'number' || !Array.isArray(data.invocations))
      throw new Error('INVALID_RUN_VIEW')
    const usage = data.usage ? object(data.usage) : undefined
    return { runId: data.runId, conversationId: typeof data.conversationId === 'string' ? data.conversationId : undefined, input: data.input === undefined ? undefined : object(data.input), versionId: typeof data.versionId === 'string' ? data.versionId : undefined, status: data.status, checkpointRef: typeof data.checkpointRef === 'string' ? data.checkpointRef : null, interactionRef: typeof data.interactionRef === 'string' ? data.interactionRef : null, cancelRequested: data.cancelRequested === true, interrupts: Array.isArray(data.interrupts)
      ? data.interrupts.map((raw: unknown) => {
          const item = object(raw)
          const value = object(item.value)
          return { id: String(item.id), value: { nodeId: String(value.nodeId), invocationId: String(value.invocationId), title: String(value.title), prompt: String(value.prompt), input: object(value.input) } }
        })
      : [], highWaterSeq: data.highWaterSeq, output: data.output, errorCode: typeof data.errorCode === 'string' ? data.errorCode : null, invocations: data.invocations.map((value: unknown) => {
      const item = object(value)
      return { id: String(item.id), parent_id: typeof item.parent_id === 'string' ? item.parent_id : null, node_id: String(item.node_id), kind: String(item.kind), version_id: typeof item.version_id === 'string' ? item.version_id : null, status: String(item.status), input: item.input, output: item.output }
    }), usage: usage ? { modelCalls: Number(usage.modelCalls), toolCalls: Number(usage.toolCalls), tokensReserved: Number(usage.tokensReserved), costStatus: String(usage.costStatus) } : undefined }
  }

  static async events(id: string, after: number, signal: AbortSignal, receive: (event: IExecutionEvent) => void) {
    const response = await fetch(`/api/v2/runs/${id}/events?after=${after}`, { credentials: 'same-origin', signal, headers: workspaceId ? { 'X-Workspace-ID': workspaceId } : {} })
    if (!response.ok || !response.body)
      throw new Error(`STREAM_${response.status}`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done)
          break
        pending = (pending + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n')
        let boundary = pending.indexOf('\n\n')
        while (boundary >= 0) {
          const frame = pending.slice(0, boundary)
          pending = pending.slice(boundary + 2)
          const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
          if (data)
            receive(event(JSON.parse(data)))
          boundary = pending.indexOf('\n\n')
        }
        if (pending.length > 1048576)
          throw new Error('EVENT_FRAME_TOO_LARGE')
      }
    }
    finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }

  static approve(id: string, view: IRunView, decisions: { interruptId: string, approved: boolean, comment: string }[], key: string) {
    return request('POST', `/runs/${id}/approvals`, { checkpointRef: view.checkpointRef, interactionRef: view.interactionRef, decisions }, { 'Idempotency-Key': key })
  }

  static cancel(id: string, key: string) { return request('POST', `/runs/${id}/cancel`, undefined, { 'Idempotency-Key': key }) }
}
