import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { Ref } from 'vue'
import LogicFlow, { BezierEdge, BezierEdgeModel } from '@logicflow/core'
import '@logicflow/core/dist/index.css'
import { Group, NodeResize, SelectionSelect } from '@logicflow/extension'
import '@logicflow/extension/dist/index.css'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { getAvailableNodes, loadNodeClass } from '@/types/flow-designer/nodeConfig'
import type { FlowTypeKey, NodeConfig } from '@/types/flow-designer/nodeConfig'
import { generateNodeId } from '@/utils/uuid'
import { useFlowDesignerStore } from '@/stores/flowDesigner'
import type { NodeBase } from '@/types/flow-designer/NodeBase'
import { NodeBaseView } from '@/types/flow-designer/NodeBaseView'
import { useTheme } from '@/composables/useTheme'

function isCurrentDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

function getCanvasColors() {
  const dark = isCurrentDark()
  return {
    bg: dark ? '#09090b' : '#eeeef1',
    grid: dark ? '#27272a' : '#d4d4d8',
    edge: dark ? '#52525b' : '#a1a1aa',
  }
}

class CustomBezierModel extends BezierEdgeModel {
  setAttributes(): void {
    super.setAttributes()
    this.offset = (this?.properties as Record<string, unknown>)?.offset as number || 100
  }

  getEdgeStyle() {
    const style = super.getEdgeStyle()
    const colors = getCanvasColors()
    return {
      ...style,
      stroke: colors.edge,
      strokeWidth: 1.5,
    }
  }
}

const customBezier = {
  type: 'customBezier',
  view: BezierEdge,
  model: CustomBezierModel,
}


export function useLogicFlowSetup(
  lfContainer: Ref<HTMLElement | null>,
  flowType: Ref<string>,
  flowId: Ref<number | null>,
  menus: {
    contextMenuVisible: Ref<boolean>
    nodeContextMenuVisible: Ref<boolean>
    nodeContextMenuPosition: Ref<{ x: number, y: number }>
    contextMenuTargetType: Ref<'node' | 'edge' | null>
    contextMenuTargetId: Ref<string | null>
    clickPosition: Ref<{ x: number, y: number }>
  },
  onLoadFlowData: (id: number) => Promise<void>,
) {
  const { t } = useI18n()
  const flowStore = useFlowDesignerStore()
  const { isDark } = useTheme()

  let lf: LogicFlow | null = null
  const currentZoomPercent = ref(80)
  const availableNodes = ref<NodeConfig[]>([])
  const currentFlowName = ref('')
  const canvasMode = ref<'move' | 'select'>('move')

  watch(flowType, (newType) => {
    if (['logic', 'ai', 'approval'].includes(newType)) {
      availableNodes.value = getAvailableNodes(newType as FlowTypeKey)
    }
  }, { immediate: true })

  const getLf = () => lf

  const applyCanvasTheme = () => {
    if (!lf || !lfContainer.value) return
    const colors = getCanvasColors()
    lfContainer.value.style.backgroundColor = colors.bg
    const svgBg = lfContainer.value.querySelector('.lf-background') as HTMLElement
    if (svgBg) svgBg.style.background = colors.bg
    const gridSvg = lfContainer.value.querySelector('.lf-grid svg') as SVGElement
    if (gridSvg) {
      const circles = gridSvg.querySelectorAll('circle')
      circles.forEach(c => c.setAttribute('fill', colors.grid))
      const lines = gridSvg.querySelectorAll('line')
      lines.forEach(l => l.setAttribute('stroke', colors.grid))
      const paths = gridSvg.querySelectorAll('path[stroke]')
      paths.forEach(p => p.setAttribute('stroke', colors.grid))
      const rects = gridSvg.querySelectorAll('rect[fill]')
      rects.forEach(r => {
        const fill = r.getAttribute('fill')
        if (fill && fill !== 'none' && !fill.startsWith('url(')) r.setAttribute('fill', colors.bg)
      })
    }
  }

  watch(isDark, () => {
    applyCanvasTheme()
  })

  const initLogicFlow = async () => {
    if (!lfContainer.value) return

    const initColors = getCanvasColors()

    LogicFlow.use(Group)
    LogicFlow.use(NodeResize)
    LogicFlow.use(SelectionSelect)

    lf = new LogicFlow({
      container: lfContainer.value,
      grid: {
        size: 20,
        visible: true,
        type: 'dot',
        config: { color: initColors.grid, thickness: 2 },
      },
      background: { backgroundImage: 'none', backgroundColor: initColors.bg },
      keyboard: { enabled: true },
      allowResize: true,
      edgeStyle: { stroke: initColors.edge, strokeWidth: 2 },
      adjustEdge: true,
      adjustEdgeStartAndEnd: true,
      history: true,
      edgeGenerator: () => 'customBezier',
      plugins: [Group, NodeResize, SelectionSelect],
    })

    lf.register(customBezier)

    for (const nodeConfig of availableNodes.value) {
      const NodeClass = await loadNodeClass(nodeConfig.typeName)
      if (NodeClass) {
        lf.register(NodeClass)
      }
    }

    if (flowId.value) {
      await onLoadFlowData(flowId.value)
    }
    else {
      lf.render({ nodes: [], edges: [] })
    }

    lf.on('node:click', ({ data }: { data: { id: string, type: string, x: number, y: number, properties: Record<string, unknown> } }) => {
      flowStore.addNode({
        id: data.id,
        type: data.type,
        x: data.x,
        y: data.y,
        properties: {
          ...data.properties,
          typeName: (data.properties?.typeName as string) || data.type,
        } as NodeBase,
      })
      flowStore.selectNode(data.id)
    })

    lf.on('node:contextmenu', ({ data, e }: { data: { id: string }, e: MouseEvent }) => {
      e.preventDefault()
      menus.nodeContextMenuPosition.value = { x: e.clientX, y: e.clientY }
      menus.contextMenuTargetType.value = 'node'
      menus.contextMenuTargetId.value = data.id
      menus.nodeContextMenuVisible.value = true
      menus.contextMenuVisible.value = false
    })

    lf.on('node:delete', ({ data }: { data: { id: string } }) => {
      NodeBaseView.destroyWidget(data.id)
      flowStore.removeNode(data.id)
      if (flowStore.selectedNodeId === data.id) {
        flowStore.selectNode(null)
      }
    })

    lf.on('edge:contextmenu', ({ data, e }: { data: { id: string }, e: MouseEvent }) => {
      e.preventDefault()
      menus.nodeContextMenuPosition.value = { x: e.clientX, y: e.clientY }
      menus.contextMenuTargetType.value = 'edge'
      menus.contextMenuTargetId.value = data.id
      menus.nodeContextMenuVisible.value = true
      menus.contextMenuVisible.value = false
    })

    lf.on('edge:add', ({ data }: { data: { id: string, sourceNodeId: string, targetNodeId: string } }) => {
      let sourceAnchorId = ''
      let targetAnchorId = ''
      if (lf) {
        const edgeModel = lf.getEdgeModelById(data.id)
        if (edgeModel) {
          sourceAnchorId = edgeModel.sourceAnchorId || ''
          targetAnchorId = edgeModel.targetAnchorId || ''
        }
      }

      flowStore.addEdge({
        id: data.id,
        sourceNodeId: data.sourceNodeId,
        targetNodeId: data.targetNodeId,
        sourceAnchorId: sourceAnchorId || undefined,
        targetAnchorId: targetAnchorId || undefined,
      })

      if (lf) {
        const sourceNodeModel = lf.getNodeModelById(data.sourceNodeId)
        if (sourceNodeModel) {
          sourceNodeModel.onEdgeAdd(data.id, sourceAnchorId, data.targetNodeId, targetAnchorId)
          flowStore.updateNodeProperties(data.sourceNodeId, sourceNodeModel.properties)
        }
      }
    })

    lf.on('edge:delete', ({ data }: { data: { id: string, sourceNodeId: string } }) => {
      const edge = flowStore.currentEdges.find(e => e.id === data.id)
      const sourceAnchorId = edge?.sourceAnchorId || ''

      flowStore.removeEdge(data.id)

      if (lf && sourceAnchorId) {
        const sourceNodeModel = lf.getNodeModelById(data.sourceNodeId)
        if (sourceNodeModel) {
          sourceNodeModel.onEdgeDelete(data.id, sourceAnchorId)
          flowStore.updateNodeProperties(data.sourceNodeId, sourceNodeModel.properties)
        }
      }
    })

    lf.on('connection:not-allowed', ({ msg }: { msg: string }) => {
      ElMessage.warning(msg || t('flowDesigner.connectionNotAllowed'))
    })

    lf.on('node:drop', ({ data }: { data: { id: string, x: number, y: number } }) => {
      flowStore.updateNodePosition(data.id, data.x, data.y)
    })

    lf.on('blank:click', () => {
      flowStore.selectNode(null)
    })

    lf.on('graph:transform', ({ transform }: { transform: { SCALE_X?: number } }) => {
      if (transform?.SCALE_X !== undefined) {
        currentZoomPercent.value = Math.round(transform.SCALE_X * 100)
      }
    })

    lfContainer.value.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!NodeBaseView.selectMode) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        e.stopImmediatePropagation()
      }
    }, true)

    setTimeout(() => {
      if (lf) {
        lf.zoom(0.88)
        currentZoomPercent.value = 88
        applyCanvasTheme()
      }
    }, 100)
  }

  const addNodeAtPosition = (nodeType: string) => {
    if (!lf) return

    const nodeConfig = availableNodes.value.find(n => n.typeName === nodeType)
    if (!nodeConfig) return

    const nodeId = generateNodeId(nodeType)

    lf.addNode({
      id: nodeId,
      type: nodeType,
      x: menus.clickPosition.value.x,
      y: menus.clickPosition.value.y,
      properties: { id: nodeId, typeName: nodeType, displayName: nodeConfig.name },
    })

    const nodeModel = lf.getNodeModelById(nodeId)
    if (nodeModel) {
      flowStore.addNode({
        id: nodeId,
        type: nodeType,
        x: nodeModel.x,
        y: nodeModel.y,
        properties: { ...nodeModel.properties, id: nodeId, typeName: nodeType } as NodeBase,
      })
    }

    ElMessage.success(t('flowDesigner.nodeAdded', { name: nodeConfig.name }))
  }

  const handleSaveNodeProperties = (nodeId: string, properties: Record<string, unknown>) => {
    if (!lf) return

    try {
      flowStore.updateNodeProperties(nodeId, properties)
      const nodeModel = lf.getNodeModelById(nodeId)
      if (nodeModel) {
        nodeModel.setProperties(properties)
        if (typeof nodeModel.onPropertiesUpdated === 'function') {
          nodeModel.onPropertiesUpdated(lf, flowStore)
        }
      }
      ElMessage.success(t('flowDesigner.nodePropertiesSaved'))
    }
    catch (error) {
      console.error('Update node properties failed:', error)
      ElMessage.error(t('flowDesigner.updateNodePropertiesFailed'))
    }
  }

  const setCanvasMode = (mode: 'move' | 'select') => {
    canvasMode.value = mode
    const isSelect = mode === 'select'
    NodeBaseView.selectMode = isSelect

    if (!lf) return
    lf.updateEditConfig({
      stopMoveGraph: isSelect,
      stopScrollGraph: false,
      adjustNodePosition: !isSelect,
    })

    if (lfContainer.value) {
      lfContainer.value.style.cursor = isSelect ? 'default' : 'grab'
      lfContainer.value.classList.toggle('select-mode', isSelect)
    }
  }

  const isGroupSelecting = ref(false)
  let _groupSelectionCleanup: (() => void) | null = null

  const _createGroupFromNodes = (selectedNodes: { id: string }[]) => {
    if (!lf) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of selectedNodes) {
      const model = lf.getNodeModelById(n.id)
      if (!model) continue
      const halfW = model.width / 2
      const halfH = model.height / 2
      minX = Math.min(minX, model.x - halfW)
      minY = Math.min(minY, model.y - halfH)
      maxX = Math.max(maxX, model.x + halfW)
      maxY = Math.max(maxY, model.y + halfH)
    }

    const pad = 30
    const gx = (minX + maxX) / 2
    const gy = (minY + maxY) / 2
    const gw = maxX - minX + pad * 2
    const gh = maxY - minY + pad * 2

    const groupId = `group_${Date.now()}`
    lf.addNode({
      id: groupId,
      type: 'group',
      x: gx,
      y: gy,
      properties: {
        width: gw,
        height: gh,
        resizable: true,
      },
    })

    const groupModel = lf.getNodeModelById(groupId) as any
    if (groupModel) {
      groupModel.width = gw
      groupModel.height = gh

      const groupPlugin = (lf.graphModel as any).group as { nodeGroupMap: Map<string, string> } | undefined

      if (groupModel.addChild) {
        for (const n of selectedNodes) {
          groupModel.addChild(n.id)
          if (groupPlugin?.nodeGroupMap) {
            groupPlugin.nodeGroupMap.set(n.id, groupId)
          }
        }
      }

      const dark = isCurrentDark()
      const origGetNodeStyle = groupModel.getNodeStyle.bind(groupModel)
      groupModel.getNodeStyle = () => {
        const style = origGetNodeStyle()
        style.stroke = dark ? '#60a5fa' : '#3b82f6'
        style.strokeWidth = 2
        style.strokeDasharray = '8 4'
        style.fill = dark ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.04)'
        style.radius = 8
        if (groupModel.isSelected) {
          style.stroke = dark ? '#93bbfd' : '#2563eb'
          style.strokeWidth = 2.5
          style.strokeDasharray = '0'
        }
        return style
      }
    }

    ElMessage.success(t('flowDesigner.groupCreated') || 'Group created')
  }

  const _exitGroupSelectionMode = () => {
    if (!lf) return
    isGroupSelecting.value = false
    const selectionPlugin = (lf.extension as any)?.selectionSelect
    if (selectionPlugin) {
      selectionPlugin.closeSelectionSelect()
    }
    if (_groupSelectionCleanup) {
      _groupSelectionCleanup()
      _groupSelectionCleanup = null
    }
    if (lfContainer.value) {
      lfContainer.value.style.cursor = canvasMode.value === 'select' ? 'default' : 'grab'
      lfContainer.value.classList.remove('group-selecting')
    }
  }

  const startGroupSelection = () => {
    if (!lf) return

    if (isGroupSelecting.value) {
      _exitGroupSelectionMode()
      return
    }

    isGroupSelecting.value = true
    const selectionPlugin = (lf.extension as any)?.selectionSelect
    if (selectionPlugin) {
      selectionPlugin.openSelectionSelect()
    }

    if (lfContainer.value) {
      lfContainer.value.style.cursor = 'crosshair'
      lfContainer.value.classList.add('group-selecting')
    }

    const handleSelectionDone = () => {
      setTimeout(() => {
        if (!lf) return
        const { nodes } = lf.getSelectElements()
        if (nodes && nodes.length >= 2) {
          _createGroupFromNodes(nodes)
        }
        else if (nodes && nodes.length > 0) {
          ElMessage.warning(t('flowDesigner.selectAtLeastTwo') || '至少选择 2 个节点')
        }
        _exitGroupSelectionMode()
      }, 50)
    }

    const container = lfContainer.value
    if (container) {
      const onMouseUp = () => {
        if (!isGroupSelecting.value) return
        handleSelectionDone()
      }
      container.addEventListener('mouseup', onMouseUp, { once: true, capture: true })
      _groupSelectionCleanup = () => {
        container.removeEventListener('mouseup', onMouseUp, true)
      }
    }
  }

  const groupSelectedNodes = () => {
    startGroupSelection()
  }

  const zoomIn = () => lf?.zoom(true)
  const zoomOut = () => lf?.zoom(false)
  const resetZoom = () => {
    if (!lf) return
    lf.resetZoom()
    lf.resetTranslate()
    currentZoomPercent.value = 100
  }

  return {
    lf: getLf,
    currentZoomPercent,
    availableNodes,
    currentFlowName,
    canvasMode,
    isGroupSelecting,
    initLogicFlow,
    addNodeAtPosition,
    handleSaveNodeProperties,
    groupSelectedNodes,
    setCanvasMode,
    zoomIn,
    zoomOut,
    resetZoom,
    getLf,
  }
}
