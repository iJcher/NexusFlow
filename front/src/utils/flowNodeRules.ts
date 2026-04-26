export interface IFlowRuleEdge {
  source: string
  target: string
  sourceHandle?: string
}

export interface IFlowConnectionValidationInput {
  sourceId: string
  targetId: string
  sourceType: string
  targetType: string
  sourceHandle?: string
  existingEdges: IFlowRuleEdge[]
}

export interface IFlowConnectionValidationResult {
  valid: boolean
  reasonKey?: string
}

interface IFlowNodeRule {
  allowPrev?: string[]
  allowNext?: string[]
  maxOutgoing?: number
}

const ANY_EXECUTABLE_NODE = [
  'ConditionNode',
  'AssignVariableNode',
  'KnowledgeNode',
  'LLMNode',
  'JSCodeNode',
  'HttpNode',
  'ReplyNode',
  'ResultNode',
]

const NON_TERMINAL_NODE = [
  'ConditionNode',
  'AssignVariableNode',
  'KnowledgeNode',
  'LLMNode',
  'JSCodeNode',
  'HttpNode',
]

export const FLOW_NODE_RULES: Record<string, IFlowNodeRule> = {
  StartNode: {
    allowPrev: [],
    allowNext: ANY_EXECUTABLE_NODE,
    maxOutgoing: 1,
  },
  ConditionNode: {
    allowNext: ANY_EXECUTABLE_NODE,
  },
  AssignVariableNode: {
    allowNext: ANY_EXECUTABLE_NODE,
    maxOutgoing: 1,
  },
  KnowledgeNode: {
    allowNext: ANY_EXECUTABLE_NODE,
    maxOutgoing: 1,
  },
  LLMNode: {
    allowNext: ANY_EXECUTABLE_NODE,
    maxOutgoing: 1,
  },
  JSCodeNode: {
    allowNext: ANY_EXECUTABLE_NODE,
    maxOutgoing: 1,
  },
  HttpNode: {
    allowNext: ANY_EXECUTABLE_NODE,
    maxOutgoing: 1,
  },
  ReplyNode: {
    allowNext: [],
  },
  ResultNode: {
    allowNext: [],
  },
}

export function getAvailableNextNodeTypes(nodeType: string): string[] {
  const rule = FLOW_NODE_RULES[nodeType]
  if (!rule?.allowNext) return ANY_EXECUTABLE_NODE
  return rule.allowNext
}

export function getAvailablePrevNodeTypes(nodeType: string): string[] {
  const rule = FLOW_NODE_RULES[nodeType]
  if (rule?.allowPrev) return rule.allowPrev
  return ['StartNode', ...NON_TERMINAL_NODE]
}

export function validateFlowConnection(
  input: IFlowConnectionValidationInput,
): IFlowConnectionValidationResult {
  if (input.sourceId === input.targetId) {
    return { valid: false, reasonKey: 'flowDesigner.connectionSelfNotAllowed' }
  }

  const sourceRule = FLOW_NODE_RULES[input.sourceType]
  const targetRule = FLOW_NODE_RULES[input.targetType]
  const nextTypes = getAvailableNextNodeTypes(input.sourceType)
  const prevTypes = getAvailablePrevNodeTypes(input.targetType)

  if (!nextTypes.includes(input.targetType)) {
    return { valid: false, reasonKey: 'flowDesigner.connectionNextTypeNotAllowed' }
  }

  if (!prevTypes.includes(input.sourceType)) {
    return { valid: false, reasonKey: 'flowDesigner.connectionPrevTypeNotAllowed' }
  }

  if (sourceRule?.maxOutgoing !== undefined) {
    const outgoingCount = input.existingEdges.filter(edge => edge.source === input.sourceId).length
    if (outgoingCount >= sourceRule.maxOutgoing) {
      return { valid: false, reasonKey: 'flowDesigner.connectionMaxOutgoingReached' }
    }
  }

  if (input.sourceHandle) {
    const sameHandleConnected = input.existingEdges.some(
      edge => edge.source === input.sourceId && edge.sourceHandle === input.sourceHandle,
    )
    if (sameHandleConnected) {
      return { valid: false, reasonKey: 'flowDesigner.connectionBranchAlreadyConnected' }
    }
  }

  const duplicateEdge = input.existingEdges.some(
    edge => edge.source === input.sourceId && edge.target === input.targetId,
  )
  if (duplicateEdge) {
    return { valid: false, reasonKey: 'flowDesigner.connectionDuplicate' }
  }

  if (targetRule?.allowNext?.length === 0 && input.existingEdges.some(edge => edge.source === input.targetId)) {
    return { valid: false, reasonKey: 'flowDesigner.connectionTerminalHasNext' }
  }

  if (wouldCreateCycle(input.sourceId, input.targetId, input.existingEdges)) {
    return { valid: false, reasonKey: 'flowDesigner.connectionCycleNotAllowed' }
  }

  return { valid: true }
}

function wouldCreateCycle(sourceId: string, targetId: string, edges: IFlowRuleEdge[]): boolean {
  const nextMap = new Map<string, string[]>()
  edges.forEach((edge) => {
    const targets = nextMap.get(edge.source) || []
    targets.push(edge.target)
    nextMap.set(edge.source, targets)
  })

  const visited = new Set<string>()
  const stack = [targetId]

  while (stack.length > 0) {
    const nodeId = stack.pop()
    if (!nodeId || visited.has(nodeId)) continue
    if (nodeId === sourceId) return true

    visited.add(nodeId)
    const nextNodes = nextMap.get(nodeId) || []
    stack.push(...nextNodes)
  }

  return false
}
