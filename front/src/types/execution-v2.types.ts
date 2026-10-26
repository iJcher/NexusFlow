export interface IBinding { source: string, path?: string, nodeId?: string, value?: unknown, key?: string }
export interface IExecutionCondition { left: IBinding, operator: string, right?: unknown }
export interface IExecutionSequence { type: string, id: string, steps: IExecutionNode[] }
export interface IExecutionNode { id: string, type: string, label?: string, input?: Record<string, IBinding>, write?: Record<string, IBinding>, value?: IBinding, versionRef?: string, toolRef?: string, cases?: { when: IExecutionCondition, body: IExecutionSequence }[], default?: IExecutionSequence, branches?: IExecutionSequence[], title?: string, prompt?: string, retry?: { maxAttempts: number }, onError?: string }
export interface IExecutionBudget { maxModelCalls: number, maxToolCalls: number, maxTokens: number, timeoutSeconds: number }
export interface IExecutionSpec {
  dslVersion: string
  kind: 'workflow' | 'agent'
  definitionKey: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  budget: IExecutionBudget
  state?: { channels: Record<string, { schema: Record<string, unknown>, reducer: string }> }
  body?: IExecutionSequence
  agent?: { prompt: string, modelConnectionRef: string, tools: string[], toolPolicy?: 'auto' | 'restricted', contextPolicy?: { triggerTokens: number, maxInputTokens: number, keepMessages: number }, remoteTools?: string[], executionTools?: { name: string, description: string, versionRef: string }[] }
}
export interface IEditorDocument { positions?: Record<string, { x: number, y: number }> }
export interface IDefinition { id: string, name: string, kind: 'workflow' | 'agent', revision: number, spec: IExecutionSpec, editor: IEditorDocument }
export interface IVersion { id: string, definitionId: string, ordinal: number, hash: string, spec: IExecutionSpec, name?: string, kind?: string, manifest?: Record<string, unknown> }
export interface IExecutionEvent { eventId: string, runId: string, seq: number, invocationId: string | null, parentInvocationId: string | null, scope: string, checkpointRef: string | null, payloadVersion: string, nodeId: string | null, attemptId: string, type: string, commitStatus: string, time: string, data: Record<string, unknown> }
export interface IInvocation { id: string, parent_id: string | null, node_id: string, kind: string, version_id?: string | null, status: string, input: unknown, output: unknown }
export interface IRunInterrupt { id: string, value: { nodeId: string, invocationId: string, title: string, prompt: string, input: Record<string, unknown> } }
export interface IRunView { runId: string, conversationId?: string, versionId?: string, status: string, input?: Record<string, unknown>, checkpointRef?: string | null, interactionRef?: string | null, interrupts?: IRunInterrupt[], cancelRequested?: boolean, output?: unknown, errorCode?: string | null, highWaterSeq: number, invocations: IInvocation[], usage?: { modelCalls: number, toolCalls: number, tokensReserved: number, costStatus: string } }
export interface IToolDescriptor { name: string, displayName?: string, readOnly: boolean, description?: string, category?: string, version?: string, inputSchema?: Record<string, unknown>, allowedHosts?: string[] }
export interface IMcpConnection { id: string, name: string, url: string, authType: string, hasCredential: boolean, enabled: boolean, revision: number, tools: { name: string, description: string, reportedReadOnly: boolean, reportedDestructive: boolean }[], readTools: string[] }
export interface ICapabilities { bundleDigest?: string, tokenReservationPolicy?: 'unlimited' | 'definition', nodes: { type: string, enabled: boolean }[], disabledNodes: string[], models: { id: string, mode: string, available?: boolean }[], tools: IToolDescriptor[] }
export interface IWorkspace { id: string, name: string, purpose: string, role: string }

export interface IConversationTurn { runId: string, input: Record<string, unknown>, output: unknown, status: string }
