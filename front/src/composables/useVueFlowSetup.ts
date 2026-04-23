import { ref, watch, computed } from 'vue'
import type { Ref } from 'vue'
import { useVueFlow, ConnectionMode, type Node, type Edge, type Connection, MarkerType, type GraphNode } from '@vue-flow/core'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { getAvailableNodes } from '@/types/flow-designer/nodeConfig'
import type { FlowTypeKey, NodeConfig } from '@/types/flow-designer/nodeConfig'
import { generateNodeId } from '@/utils/uuid'
import { useFlowDesignerStore } from '@/stores/flowDesigner'
import type { NodeBase } from '@/types/flow-designer/NodeBase'

const NODE_TYPE_MAP: Record<string, string> = {
  StartNode: 'start',
  LLMNode: 'llm',
  ReplyNode: 'reply',
  ConditionNode: 'condition',
  AssignVariableNode: 'assign',
  JSCodeNode: 'jscode',
  HttpNode: 'http',
  ResultNode: 'result',
  KnowledgeNode: 'knowledge',
}

function toVueFlowType(typeName: string): string {
  return NODE_TYPE_MAP[typeName] || typeName.toLowerCase().replace(/node$/i, '')
}

function toLogicFlowType(vfType: string): string {
  for (const [lfType, vf] of Object.entries(NODE_TYPE_MAP)) {
    if (vf === vfType) return lfType
  }
  return vfType
}

export function useVueFlowSetup(
  flowType: Ref<string>,
  flowId: Ref<number | null>,
  onLoadFlowData: (id: number) => Promise<void>,
) {
  const { t } = useI18n()
  const flowStore = useFlowDesignerStore()

  const availableNodes = ref<NodeConfig[]>([])
  const currentFlowName = ref('')

  watch(flowType, (newType) => {
    if (['logic', 'ai', 'approval'].includes(newType)) {
      availableNodes.value = getAvailableNodes(newType as FlowTypeKey)
    }
  }, { immediate: true })

  const canvasMode = ref<'move' | 'select'>('move')

  const {
    nodes,
    edges,
    addNodes,
    setNodes,
    removeNodes,
    addEdges,
    setEdges,
    removeEdges,
    onConnect,
    onNodesChange,
    onEdgesChange,
    onNodeDragStop,
    onPaneClick,
    project,
    fitView,
    zoomIn: vfZoomIn,
    zoomOut: vfZoomOut,
    setViewport,
    getViewport,
    onNodeClick,
    onEdgeClick,
    toObject,
    fromObject,
    getSelectedNodes,
  } = useVueFlow({
    id: 'nexusflow-canvas',
    defaultEdgeOptions: {
      type: 'default',
      animated: false,
      markerEnd: MarkerType.ArrowClosed,
      style: { strokeWidth: 1.5 },
    },
    connectionMode: ConnectionMode.Loose,
    snapToGrid: true,
    snapGrid: [20, 20],
    fitViewOnInit: false,
    deleteKeyCode: 'Delete',
    multiSelectionKeyCode: 'Meta',
    zoomOnScroll: true,
    minZoom: 0.2,
    maxZoom: 3,
  })

  const isGroupSelecting = ref(false)

  const toggleGroupSelect = () => {
    isGroupSelecting.value = !isGroupSelecting.value
  }

  const setCanvasMode = (mode: 'move' | 'select') => {
    canvasMode.value = mode
    isGroupSelecting.value = false
  }

  const currentZoomPercent = computed(() => {
    const vp = getViewport()
    return Math.round(vp.zoom * 100)
  })

  onConnect((connection: Connection) => {
    if (!connection.source || !connection.target) return

    const edgeId = `e_${connection.source}_${connection.target}_${Date.now()}`
    const newEdge: Edge = {
      id: edgeId,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle || undefined,
      targetHandle: connection.targetHandle || undefined,
      type: 'default',
      markerEnd: MarkerType.ArrowClosed,
    }
    addEdges([newEdge])

    flowStore.addEdge({
      id: edgeId,
      sourceNodeId: connection.source,
      targetNodeId: connection.target,
      sourceAnchorId: connection.sourceHandle || undefined,
      targetAnchorId: connection.targetHandle || undefined,
    })
  })

  onNodeDragStop(({ node }) => {
    flowStore.updateNodePosition(node.id, node.position.x, node.position.y)
  })

  onPaneClick(() => {
    flowStore.selectNode(null)
  })

  onNodeClick(({ node }) => {
    const typeName = toLogicFlowType(node.type || '')
    flowStore.addNode({
      id: node.id,
      type: typeName,
      x: node.position.x,
      y: node.position.y,
      properties: {
        ...node.data,
        typeName: node.data?.typeName || typeName,
      } as NodeBase,
    })
    flowStore.selectNode(node.id)
  })

  const initCanvas = async () => {
    if (flowId.value) {
      await onLoadFlowData(flowId.value)
    }
  }

  const addNodeAtCenter = (nodeType: string, position?: { x: number, y: number }) => {
    const nodeConfig = availableNodes.value.find(n => n.typeName === nodeType)
    if (!nodeConfig) return

    const nodeId = generateNodeId(nodeType)
    const pos = position || { x: 300 + Math.random() * 200, y: 200 + Math.random() * 150 }

    const vfType = toVueFlowType(nodeType)

    const defaultData: Record<string, any> = {
      typeName: nodeType,
      displayName: nodeConfig.name,
      id: nodeId,
    }

    const newNode: Node = {
      id: nodeId,
      type: vfType,
      position: pos,
      data: defaultData,
    }

    addNodes([newNode])

    flowStore.addNode({
      id: nodeId,
      type: nodeType,
      x: pos.x,
      y: pos.y,
      properties: { ...defaultData } as NodeBase,
    })

    ElMessage.success(t('flowDesigner.nodeAdded', { name: nodeConfig.name }))
  }

  const addNodeAndConnect = (sourceNodeId: string, sourceHandleId: string, nodeType: string) => {
    const sourceNode = nodes.value.find(n => n.id === sourceNodeId)
    if (!sourceNode) return

    const nodeConfig = availableNodes.value.find(n => n.typeName === nodeType)
    if (!nodeConfig) return

    const nodeId = generateNodeId(nodeType)
    const newPos = {
      x: (sourceNode.position?.x ?? 0) + 350,
      y: (sourceNode.position?.y ?? 0),
    }

    const vfType = toVueFlowType(nodeType)
    const defaultData: Record<string, any> = {
      typeName: nodeType,
      displayName: nodeConfig.name,
      id: nodeId,
    }

    addNodes([{ id: nodeId, type: vfType, position: newPos, data: defaultData }])
    flowStore.addNode({
      id: nodeId,
      type: nodeType,
      x: newPos.x,
      y: newPos.y,
      properties: { ...defaultData } as NodeBase,
    })

    const edgeId = `e_${sourceNodeId}_${nodeId}_${Date.now()}`
    addEdges([{
      id: edgeId,
      source: sourceNodeId,
      target: nodeId,
      sourceHandle: sourceHandleId,
      targetHandle: `${nodeId}_left`,
      type: 'default',
      markerEnd: MarkerType.ArrowClosed,
    }])
    flowStore.addEdge({
      id: edgeId,
      sourceNodeId: sourceNodeId,
      targetNodeId: nodeId,
      sourceAnchorId: sourceHandleId,
      targetAnchorId: `${nodeId}_left`,
    })

    ElMessage.success(t('flowDesigner.nodeAdded', { name: nodeConfig.name }))
  }

  const handleSaveNodeProperties = (nodeId: string, properties: Record<string, unknown>) => {
    try {
      flowStore.updateNodeProperties(nodeId, properties)

      const node = nodes.value.find(n => n.id === nodeId)
      if (node) {
        node.data = { ...node.data, ...properties }
      }

      ElMessage.success(t('flowDesigner.nodePropertiesSaved'))
    }
    catch (error) {
      console.error('Update node properties failed:', error)
      ElMessage.error(t('flowDesigner.updateNodePropertiesFailed'))
    }
  }

  const deleteNode = (nodeId: string) => {
    const targetNode = nodes.value.find(n => n.id === nodeId)
    if (targetNode?.type === 'group') {
      deleteGroup(nodeId)
    }
    else {
      removeNodes([nodeId])
    }
    flowStore.removeNode(nodeId)
    if (flowStore.selectedNodeId === nodeId) {
      flowStore.selectNode(null)
    }
  }

  const deleteEdge = (edgeId: string) => {
    removeEdges([edgeId])
    flowStore.removeEdge(edgeId)
  }

  const zoomIn = () => vfZoomIn()
  const zoomOut = () => vfZoomOut()
  const resetZoom = () => {
    setViewport({ x: 0, y: 0, zoom: 1 })
  }

  const NODE_DEFAULT_WIDTH = 220
  const NODE_DEFAULT_HEIGHT = 80
  const GROUP_PADDING = 30

  const resolveNodeSize = (node: Node | GraphNode) => ({
    width: (node as any).dimensions?.width || (node as any).width || NODE_DEFAULT_WIDTH,
    height: (node as any).dimensions?.height || (node as any).height || NODE_DEFAULT_HEIGHT,
  })

  const createGroupFromSelection = () => {
    const selected = getSelectedNodes.value.filter(
      (n: GraphNode) => n.type !== 'group' && !n.parentNode,
    )

    if (selected.length < 2) {
      if (selected.length > 0) {
        ElMessage.warning(t('flowDesigner.selectAtLeastTwo') || '至少选择 2 个节点才能创建分组')
      }
      return
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const node of selected) {
      const { width, height } = resolveNodeSize(node)
      const left = node.position.x
      const top = node.position.y
      minX = Math.min(minX, left)
      minY = Math.min(minY, top)
      maxX = Math.max(maxX, left + width)
      maxY = Math.max(maxY, top + height)
    }

    const groupX = minX - GROUP_PADDING
    const groupY = minY - GROUP_PADDING
    const groupWidth = Math.max(260, maxX - minX + GROUP_PADDING * 2)
    const groupHeight = Math.max(180, maxY - minY + GROUP_PADDING * 2)

    const groupId = `group_${Date.now()}`

    const groupNode: Node = {
      id: groupId,
      type: 'group',
      position: { x: groupX, y: groupY },
      data: { title: 'Group', width: groupWidth, height: groupHeight },
      zIndex: 0,
      style: { width: `${groupWidth}px`, height: `${groupHeight}px` },
    }

    const updatedChildren = selected.map(node => ({
      ...node,
      parentNode: groupId,
      position: {
        x: node.position.x - groupX,
        y: node.position.y - groupY,
      },
      selected: false,
    }))

    const otherNodes = nodes.value.filter(
      n => n.id !== groupId && !selected.some(s => s.id === n.id),
    )

    setNodes([groupNode, ...otherNodes.map(n => ({ ...n })), ...updatedChildren])

    ElMessage.success(t('flowDesigner.groupCreated') || '分组创建成功')
    isGroupSelecting.value = false
  }

  const deleteGroup = (groupId: string) => {
    const groupNode = nodes.value.find(n => n.id === groupId)
    if (!groupNode || groupNode.type !== 'group') return

    const groupPos = groupNode.position

    const updatedNodes = nodes.value
      .filter(n => n.id !== groupId)
      .map(n => {
        if (n.parentNode !== groupId) return n
        return {
          ...n,
          parentNode: undefined,
          extent: undefined,
          position: {
            x: groupPos.x + n.position.x,
            y: groupPos.y + n.position.y,
          },
        }
      })

    setNodes(updatedNodes)
    ElMessage.success(t('flowDesigner.groupDeleted') || '分组已解散')
  }

  const getGraphData = () => {
    return toObject()
  }

  const renderGraphData = (graphData: { nodes: any[], edges: any[] }) => {
    const vfNodes: Node[] = graphData.nodes.map(n => {
      const nodeType = n.type || n.properties?.typeName || ''
      const vfType = nodeType === 'group' ? 'group' : toVueFlowType(nodeType)
      const node: Node = {
        id: n.id,
        type: vfType,
        position: { x: n.x ?? n.position?.x ?? 0, y: n.y ?? n.position?.y ?? 0 },
        data: n.properties || n.data || {},
      }
      if (n.parentNode) node.parentNode = n.parentNode
      if (n.zIndex != null) node.zIndex = n.zIndex
      if (vfType === 'group' && node.data) {
        node.style = {
          width: `${node.data.width || 300}px`,
          height: `${node.data.height || 200}px`,
        }
      }
      return node
    })

    vfNodes.sort((a, b) => {
      const aRoot = !a.parentNode
      const bRoot = !b.parentNode
      if (aRoot !== bRoot) return aRoot ? -1 : 1
      const aGroup = a.type === 'group'
      const bGroup = b.type === 'group'
      if (aGroup !== bGroup) return aGroup ? -1 : 1
      return 0
    })

    const vfEdges: Edge[] = graphData.edges.map(e => ({
      id: e.id,
      source: e.sourceNodeId || e.source,
      target: e.targetNodeId || e.target,
      sourceHandle: e.sourceAnchorId || e.sourceHandle || undefined,
      targetHandle: e.targetAnchorId || e.targetHandle || undefined,
      type: 'default',
      markerEnd: MarkerType.ArrowClosed,
    }))

    setNodes(vfNodes)
    setEdges(vfEdges)
  }

  return {
    nodes,
    edges,
    canvasMode,
    currentZoomPercent,
    availableNodes,
    currentFlowName,
    initCanvas,
    addNodeAtCenter,
    addNodeAndConnect,
    handleSaveNodeProperties,
    deleteNode,
    deleteEdge,
    zoomIn,
    zoomOut,
    resetZoom,
    setCanvasMode,
    isGroupSelecting,
    toggleGroupSelect,
    createGroupFromSelection,
    deleteGroup,
    getGraphData,
    renderGraphData,
    project,
    fitView,
  }
}
