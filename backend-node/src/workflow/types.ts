export interface FlowConfigInfo {
  variables: Variable[];
  inputParameters: Variable[];
  nodes: NodeConfig[];
  lines: NodeLine[];
}

export interface Variable {
  typeName: string;
  id?: string;
  name: string;
  required?: boolean;
  defaultValue?: unknown;
  hasValue?: boolean;
  value?: unknown;
}

export interface ExpressionUnit {
  typeName?: string;
  text?: string;
  Text?: string;
}

export interface ConditionRule {
  expressionUnit?: ExpressionUnit;
  lineId?: string;
}

export interface HttpKeyValueItem {
  enabled?: boolean;
  key?: string;
  value?: string;
}

export interface NodeConfig {
  typeName: string;
  id: string;
  displayName?: string;
  description?: string;
  modelSelection?: string;
  modelName?: string;
  systemPrompt?: ExpressionUnit;
  userPrompt?: ExpressionUnit;
  temperature?: number;
  enableThinking?: boolean;
  message?: ExpressionUnit;
  conditions?: ConditionRule[];
  elseRule?: ConditionRule;
  assignments?: {
    expressionUnit?: ExpressionUnit;
    targetVariableName: string;
  }[];
  knowledgeBaseIds?: string[];
  queryExpression?: ExpressionUnit;
  topK?: number;
  threshold?: number;
  embeddingModel?: string;
  rerankEnabled?: boolean;
  outputVariable?: string;
  url?: string | ExpressionUnit;
  query?: string | ExpressionUnit;
  body?: string | ExpressionUnit;
  headers?: string | ExpressionUnit;
  method?: string;
  timeoutSeconds?: number;
  bodyMode?: string;
  queryParams?: HttpKeyValueItem[];
  headerParams?: HttpKeyValueItem[];
  [key: string]: unknown;
}

export interface NodeLine {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  sourceAnchorId?: string;
  targetAnchorId?: string;
}

export interface NodeExecuteResult {
  nodeId: string;
  isSuccess: boolean;
  result?: unknown;
  errorMsg: string;
  errorCode: number;
  streamingExecutor?: () => AsyncGenerator<string>;
}

export interface FlowRuntimeContext {
  flowId: bigint;
  ownerUserId: string;
  user: string;
  flowInstanceId: bigint;
  displayName: string;
  flowConfigInfoForRun: FlowConfigInfo;
  startTime: Date;
  inputVariables: Variable[];
  inputVariablesOriginal: Record<string, unknown>;
  variables: Variable[];
  request?: AIChatRequest;
  conversationId?: string;
  dialogueCount?: number;
  files?: AIFileRequest[];
  chatHistory?: ChatHistoryMessage[];
}

export interface AIChatRequest {
  query: string;
  user: string;
  conversationId?: string;
  responseMode?: string;
  inputs?: Record<string, unknown>;
  files?: AIFileRequest[];
}

export interface AIFileRequest {
  url: string;
  name?: string;
  size?: number;
  mimeType?: string;
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type NodeRunStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped';

export interface NodeRunState {
  nodeId: string;
  status: NodeRunStatus;
  startedAt?: Date;
  finishedAt?: Date;
  errorMsg?: string;
}
