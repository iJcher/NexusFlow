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
  defaultValue?: any;
  hasValue?: boolean;
  value?: any;
}

export interface NodeConfig {
  typeName: string;
  id: string;
  displayName?: string;
  description?: string;
  [key: string]: any;
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
  result?: any;
  errorMsg: string;
  errorCode: number;
  streamingExecutor?: () => AsyncGenerator<string>;
}

export interface FlowRuntimeContext {
  flowId: bigint;
  user: string;
  flowInstanceId: bigint;
  displayName: string;
  flowConfigInfoForRun: FlowConfigInfo;
  startTime: Date;
  inputVariables: Variable[];
  inputVariablesOriginal: Record<string, any>;
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
  inputs?: Record<string, any>;
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
