import type { FlowEdge, FlowNode } from '@/stores/flowDesigner'
import { validateFlowConnection } from '@/utils/flowNodeRules'

export type FlowValidationSeverity = 'error' | 'warning'

export interface IFlowValidationIssue {
  severity: FlowValidationSeverity
  messageKey: string
  params?: Record<string, string | number>
}

interface IConditionRule {
  id?: string
  lineId?: string
  description?: string
  expressionUnit?: unknown
}

interface IElseRule {
  id?: string
  lineId?: string
}

export interface IFlowGraphValidationInput {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

const TERMINAL_NODE_TYPES = new Set(['ReplyNode', 'EndNode'])
const UNSUPPORTED_RUNTIME_NODE_TYPES = new Set(['ResultNode'])

export function validateFlowGraph(input: IFlowGraphValidationInput): IFlowValidationIssue[] {
  const issues: IFlowValidationIssue[] = []
  const nodes = input.nodes
  const edges = input.edges
  const nodeMap = new Map(nodes.map(node => [node.id, node]))

  if (nodes.length === 0) {
    return [createIssue('flowDesigner.validationEmptyFlow')]
  }

  validateStartAndTerminal(nodes, edges, issues)
  validateEdges(nodes, edges, nodeMap, issues)
  validateReachability(nodes, edges, issues)
  validateNodeConfigurations(nodes, edges, issues)

  return issues
}

function validateStartAndTerminal(
  nodes: FlowNode[],
  edges: FlowEdge[],
  issues: IFlowValidationIssue[],
) {
  const startNodes = nodes.filter(node => getNodeType(node) === 'StartNode')
  if (startNodes.length === 0) {
    issues.push(createIssue('flowDesigner.validationMissingStart'))
  }
  if (startNodes.length > 1) {
    issues.push(createIssue('flowDesigner.validationMultipleStart', { count: startNodes.length }))
  }

  if (!nodes.some(node => TERMINAL_NODE_TYPES.has(getNodeType(node)))) {
    issues.push(createIssue('flowDesigner.validationMissingTerminal'))
  }

  startNodes.forEach((node) => {
    if (!edges.some(edge => edge.sourceNodeId === node.id)) {
      issues.push(createIssue('flowDesigner.validationStartMissingNext', { node: getNodeName(node) }))
    }
  })
}

function validateEdges(
  nodes: FlowNode[],
  edges: FlowEdge[],
  nodeMap: Map<string, FlowNode>,
  issues: IFlowValidationIssue[],
) {
  const previousEdges: Array<{ source: string; target: string; sourceHandle?: string }> = []

  edges.forEach((edge) => {
    const sourceNode = nodeMap.get(edge.sourceNodeId)
    const targetNode = nodeMap.get(edge.targetNodeId)

    if (!sourceNode || !targetNode) {
      issues.push(createIssue('flowDesigner.validationUnknownEdgeNode', { edge: edge.id }))
      return
    }

    const validation = validateFlowConnection({
      sourceId: edge.sourceNodeId,
      targetId: edge.targetNodeId,
      sourceType: getNodeType(sourceNode),
      targetType: getNodeType(targetNode),
      sourceHandle: edge.sourceAnchorId,
      existingEdges: previousEdges,
    })

    if (!validation.valid) {
      issues.push(createIssue('flowDesigner.validationInvalidConnection', {
        source: getNodeName(sourceNode),
        target: getNodeName(targetNode),
      }))
    }

    previousEdges.push({
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      sourceHandle: edge.sourceAnchorId,
    })
  })

  nodes.forEach((node) => {
    const nodeType = getNodeType(node)
    if (nodeType === 'StartNode') return

    const hasIncoming = edges.some(edge => edge.targetNodeId === node.id)
    if (!hasIncoming) {
      issues.push(createIssue('flowDesigner.validationNodeMissingPrev', { node: getNodeName(node) }))
    }

    const hasOutgoing = edges.some(edge => edge.sourceNodeId === node.id)
    if (!TERMINAL_NODE_TYPES.has(nodeType) && !hasOutgoing) {
      issues.push(createIssue('flowDesigner.validationNodeMissingNext', { node: getNodeName(node) }))
    }
  })
}

function validateReachability(
  nodes: FlowNode[],
  edges: FlowEdge[],
  issues: IFlowValidationIssue[],
) {
  const startNode = nodes.find(node => getNodeType(node) === 'StartNode')
  if (!startNode) return

  const nextMap = new Map<string, string[]>()
  edges.forEach((edge) => {
    const list = nextMap.get(edge.sourceNodeId) || []
    list.push(edge.targetNodeId)
    nextMap.set(edge.sourceNodeId, list)
  })

  const reachable = new Set<string>()
  const stack = [startNode.id]
  while (stack.length > 0) {
    const nodeId = stack.pop()
    if (!nodeId || reachable.has(nodeId)) continue
    reachable.add(nodeId)
    stack.push(...(nextMap.get(nodeId) || []))
  }

  nodes.forEach((node) => {
    if (!reachable.has(node.id)) {
      issues.push(createIssue('flowDesigner.validationNodeUnreachable', { node: getNodeName(node) }))
    }
  })
}

function validateNodeConfigurations(
  nodes: FlowNode[],
  edges: FlowEdge[],
  issues: IFlowValidationIssue[],
) {
  nodes.forEach((node) => {
    const nodeType = getNodeType(node)
    const properties = node.properties

    if (UNSUPPORTED_RUNTIME_NODE_TYPES.has(nodeType)) {
      issues.push(createIssue('flowDesigner.validationUnsupportedResultNode', { node: getNodeName(node) }))
      return
    }

    if (nodeType === 'ConditionNode') {
      validateConditionNode(node, edges, issues)
    }
    if (nodeType === 'LLMNode' && !hasText(properties.modelSelection) && !hasText(properties.modelName)) {
      issues.push(createIssue('flowDesigner.validationLlmMissingModel', { node: getNodeName(node) }))
    }
    if (nodeType === 'KnowledgeNode') {
      const ids = Array.isArray(properties.knowledgeBaseIds) ? properties.knowledgeBaseIds : []
      if (ids.length === 0) {
        issues.push(createIssue('flowDesigner.validationKnowledgeMissingBase', { node: getNodeName(node) }))
      }
      if (!hasExpressionText(properties.queryExpression)) {
        issues.push(createIssue('flowDesigner.validationKnowledgeMissingQuery', { node: getNodeName(node) }))
      }
    }
    if (nodeType === 'HttpNode' && !hasExpressionText(properties.url)) {
      issues.push(createIssue('flowDesigner.validationHttpMissingUrl', { node: getNodeName(node) }))
    }
    if (nodeType === 'AssignVariableNode') {
      validateAssignNode(node, issues)
    }
    if (nodeType === 'JSCodeNode' && !hasExpressionText(properties.codeUnit)) {
      issues.push(createIssue('flowDesigner.validationJsCodeMissingCode', { node: getNodeName(node) }))
    }
  })
}

function validateConditionNode(
  node: FlowNode,
  edges: FlowEdge[],
  issues: IFlowValidationIssue[],
) {
  const conditions = Array.isArray(node.properties.conditions)
    ? node.properties.conditions as IConditionRule[]
    : []
  const elseRule = node.properties.elseRule as IElseRule | undefined

  if (conditions.length === 0) {
    issues.push(createIssue('flowDesigner.validationConditionMissingRules', { node: getNodeName(node) }))
  }

  conditions.forEach((condition, index) => {
    const label = condition.description || `${getNodeName(node)} #${index + 1}`
    if (!hasExpressionText(condition.expressionUnit)) {
      issues.push(createIssue('flowDesigner.validationConditionBranchMissingExpression', { branch: label }))
    }
    if (!condition.lineId || !edges.some(edge => edge.id === condition.lineId && edge.sourceNodeId === node.id)) {
      issues.push(createIssue('flowDesigner.validationConditionBranchMissingLine', { branch: label }))
    }
  })

  if (!elseRule?.lineId || !edges.some(edge => edge.id === elseRule.lineId && edge.sourceNodeId === node.id)) {
    issues.push(createIssue('flowDesigner.validationConditionElseMissingLine', { node: getNodeName(node) }))
  }
}

function validateAssignNode(node: FlowNode, issues: IFlowValidationIssue[]) {
  const assignments = Array.isArray(node.properties.assignments)
    ? node.properties.assignments as Array<{ targetVariableName?: string; expressionUnit?: unknown }>
    : []

  if (assignments.length === 0) {
    issues.push(createIssue('flowDesigner.validationAssignMissingAssignments', { node: getNodeName(node) }))
    return
  }

  assignments.forEach((assignment, index) => {
    const label = `${getNodeName(node)} #${index + 1}`
    if (!hasText(assignment.targetVariableName)) {
      issues.push(createIssue('flowDesigner.validationAssignMissingTarget', { assignment: label }))
    }
    if (!hasExpressionText(assignment.expressionUnit)) {
      issues.push(createIssue('flowDesigner.validationAssignMissingExpression', { assignment: label }))
    }
  })
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function hasExpressionText(value: unknown): boolean {
  if (typeof value === 'string') return hasText(value)
  if (!value || typeof value !== 'object') return false

  const unit = value as Record<string, unknown>
  return hasText(unit.text)
    || hasText(unit.Text)
    || hasText(unit.expressionCode)
    || hasText(unit.functionCode)
}

function getNodeType(node: FlowNode): string {
  return String(node.properties.typeName || node.type || '')
}

function getNodeName(node: FlowNode): string {
  return String(node.properties.displayName || node.properties.description || node.id)
}

function createIssue(
  messageKey: string,
  params?: Record<string, string | number>,
): IFlowValidationIssue {
  return {
    severity: 'error',
    messageKey,
    params,
  }
}
