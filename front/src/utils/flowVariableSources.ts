import type { FlowEdge, FlowNode } from '@/stores/flowDesigner'
import { VariableItemType } from '@/types/flow-designer/Parameters/Variable'
import type { NodeOutputItem } from '@/types/flow-designer/NodeBase'

export interface INodeOutputGroup {
  nodeId: string
  nodeName: string
  outputs: Array<{
    key: string
    label: string
    outputName: string
    variableType: VariableItemType
    category: 'node'
  }>
}

const NODE_OUTPUT_SCHEMA: Record<string, NodeOutputItem[]> = {
  LLMNode: [
    { name: 'text', variableType: VariableItemType.StringVariable },
    { name: 'tokenUsage', variableType: VariableItemType.ObjectVariable },
  ],
  KnowledgeNode: [
    { name: 'context', variableType: VariableItemType.StringVariable },
    { name: 'documents', variableType: VariableItemType.ArrayVariable },
    { name: 'count', variableType: VariableItemType.LongVariable },
  ],
  HttpNode: [
    { name: 'responseBody', variableType: VariableItemType.StringVariable },
    { name: 'statusCode', variableType: VariableItemType.LongVariable },
  ],
  JSCodeNode: [
    { name: 'result', variableType: VariableItemType.ObjectVariable },
  ],
  AssignVariableNode: [
    { name: 'assigned', variableType: VariableItemType.ObjectVariable },
  ],
}

export function getNodeOutputSchema(node: FlowNode): NodeOutputItem[] {
  const explicitOutputs = node.properties?.outputs
  if (Array.isArray(explicitOutputs) && explicitOutputs.length > 0) {
    return explicitOutputs as NodeOutputItem[]
  }

  const typeName = String(node.properties?.typeName || node.type || '')
  return NODE_OUTPUT_SCHEMA[typeName] || []
}

export function getBeforeNodes(currentNodeId: string | undefined, nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  if (!currentNodeId) return nodes

  const nodeMap = new Map(nodes.map(node => [node.id, node]))
  const prevMap = new Map<string, string[]>()
  edges.forEach((edge) => {
    const prevIds = prevMap.get(edge.targetNodeId) || []
    prevIds.push(edge.sourceNodeId)
    prevMap.set(edge.targetNodeId, prevIds)
  })

  const result: FlowNode[] = []
  const visited = new Set<string>()
  const stack = [...(prevMap.get(currentNodeId) || [])]

  while (stack.length > 0) {
    const nodeId = stack.pop()
    if (!nodeId || visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (node) result.push(node)

    stack.push(...(prevMap.get(nodeId) || []))
  }

  return result.reverse()
}

export function buildNodeOutputGroups(
  currentNodeId: string | undefined,
  nodes: FlowNode[],
  edges: FlowEdge[],
): INodeOutputGroup[] {
  const beforeNodes = getBeforeNodes(currentNodeId, nodes, edges)

  return beforeNodes
    .map((node) => {
      const outputs = getNodeOutputSchema(node).map(output => ({
        key: `${node.id}.${output.name}`,
        label: `${node.properties?.displayName || node.id}.${output.name}`,
        outputName: output.name,
        variableType: output.variableType,
        category: 'node' as const,
      }))

      return {
        nodeId: node.id,
        nodeName: String(node.properties?.displayName || node.id),
        outputs,
      }
    })
    .filter(group => group.outputs.length > 0)
}
