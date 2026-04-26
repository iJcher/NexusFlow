import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import type { Ref } from 'vue'
import type { Node, Edge } from '@vue-flow/core'
import { FlowService } from '@/services/flow.service'
import { useFlowDesignerStore } from '@/stores/flowDesigner'
import type { IFlowConfigInfo, IUpdateFlowRequest } from '@/types/flow.types'
import type { NodeBase } from '@/types/flow-designer/NodeBase'
import type { NodeLine } from '@/types/flow-designer/NodeLine'
import { validateFlowGraph } from '@/utils/flowGraphValidator'

const LOCAL_STORAGE_PREFIX = 'nf_flow_web_'

function saveToLocal(flowId: number | string, webConfigJson: string) {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${flowId}`, webConfigJson)
  } catch { /* quota exceeded */ }
}

function loadFromLocal(flowId: number | string): string | null {
  try {
    return localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${flowId}`)
  } catch { return null }
}

function formatValidationMessages(
  issues: ReturnType<typeof validateFlowGraph>,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const visibleIssues = issues.slice(0, 8)
  const lines = visibleIssues.map((issue, index) => `${index + 1}. ${t(issue.messageKey, issue.params)}`)
  if (issues.length > visibleIssues.length) {
    lines.push(t('flowDesigner.validationMoreIssues', { count: issues.length - visibleIssues.length }))
  }
  return lines.join('\n')
}

export function useFlowPersistenceVF(
  flowType: Ref<string>,
  flowId: Ref<number | null>,
  currentFlowName: Ref<string>,
  getGraphData: () => { nodes: Node[], edges: Edge[], position: [number, number], zoom: number },
  renderGraphData: (data: { nodes: any[], edges: any[] }) => void,
) {
  const { t } = useI18n()
  const flowStore = useFlowDesignerStore()

  const renderWebConfig = (webConfig: any, id: number) => {
    if (webConfig.storeData) {
      flowStore.setFlowData(id.toString(), {
        nodes: webConfig.storeData.nodes || [],
        edges: webConfig.storeData.edges || [],
        inputParameters: webConfig.storeData.inputParameters || [],
        sessionVariables: webConfig.storeData.sessionVariables || [],
        name: currentFlowName.value,
      })
    }

    if (webConfig.vueFlowData) {
      renderGraphData({
        nodes: webConfig.vueFlowData.nodes || [],
        edges: webConfig.vueFlowData.edges || [],
      })
    } else if (webConfig.logicFlowData) {
      renderGraphData({
        nodes: webConfig.logicFlowData.nodes || [],
        edges: webConfig.logicFlowData.edges || [],
      })
    }

    if (!webConfig.storeData) {
      setTimeout(() => {
        const graphData = getGraphData()
        const nodes = graphData.nodes.map(n => ({
          id: n.id,
          type: n.data?.typeName || n.type || '',
          x: n.position.x,
          y: n.position.y,
          properties: (n.data || {}) as NodeBase,
        }))
        const edges = graphData.edges.map(e => ({
          id: e.id,
          sourceNodeId: e.source,
          targetNodeId: e.target,
          sourceAnchorId: e.sourceHandle || undefined,
          targetAnchorId: e.targetHandle || undefined,
        }))
        flowStore.syncFromLogicFlow({ nodes, edges })
      }, 100)
    }
  }

  const loadFlowData = async (id: number) => {
    try {
      const response = await FlowService.getFlowById(id)
      if (response.errCode === 0 && response.data) {
        const flowData = response.data
        currentFlowName.value = flowData.displayName || t('flowDesigner.unnamedFlow')

        let webConfigSource: string | null = null

        if (flowData.configInfoForWeb) {
          webConfigSource = flowData.configInfoForWeb
        } else {
          webConfigSource = loadFromLocal(id)
          if (webConfigSource) {
            console.warn('[FlowPersistence] Using localStorage fallback')
          }
        }

        if (webConfigSource) {
          try {
            const webConfig = JSON.parse(webConfigSource)
            renderWebConfig(webConfig, id)
            ElMessage.success(t('flowDesigner.flowLoadSuccess'))
          }
          catch (error) {
            console.error('[FlowPersistence] Parse web config failed:', error)
            ElMessage.warning(t('flowDesigner.configFormatError'))
          }
        }
        else if (flowData.configInfoForRun) {
          const runConfig = flowData.configInfoForRun
          flowStore.setFlowData(id.toString(), {
            nodes: [],
            edges: [],
            inputParameters: runConfig.inputParameters || [],
            sessionVariables: runConfig.variables || [],
            name: currentFlowName.value,
          })
          renderGraphData({ nodes: [], edges: [] })
          ElMessage.info(t('flowDesigner.variableLoadedEmptyCanvas'))
        }
        else {
          flowStore.setFlowData(id.toString(), {
            nodes: [],
            edges: [],
            inputParameters: [],
            sessionVariables: [],
            name: currentFlowName.value,
          })
          renderGraphData({ nodes: [], edges: [] })
          ElMessage.info(t('flowDesigner.emptyCanvasInitialized'))
        }
      }
      else {
        ElMessage.error(response.errMsg || t('flowDesigner.loadFlowFailed'))
      }
    }
    catch (error) {
      console.error('Load flow data failed:', error)
      ElMessage.error(t('flowDesigner.loadFlowDataFailed'))
    }
  }

  const generateConfigInfoForRun = (): IFlowConfigInfo => {
    const uiKeys = new Set(['x', 'y', 'width', 'height', 'zIndex', 'id', 'description', 'displayName', 'typeName'])

    const nodes: NodeBase[] = flowStore.currentNodes.map((node) => {
      const runNode: NodeBase = {
        id: node.id,
        description: node.properties.description,
        displayName: node.properties.displayName,
        typeName: node.properties.typeName,
      }

      Object.entries(node.properties).forEach(([key, value]) => {
        if (!uiKeys.has(key)) {
          ;(runNode as unknown as Record<string, unknown>)[key] = value
        }
      })

      return runNode
    })

    const lines: NodeLine[] = flowStore.currentEdges.map(edge => ({
      id: edge.id,
      fromNodeId: edge.sourceNodeId,
      toNodeId: edge.targetNodeId,
      sourceAnchorId: edge.sourceAnchorId,
      targetAnchorId: edge.targetAnchorId,
    }))

    return {
      variables: flowStore.currentSessionVariables,
      inputParameters: flowStore.currentInputParameters,
      nodes,
      lines,
    }
  }

  const generateConfigInfoForWeb = (): string => {
    const graphData = getGraphData()

    const vueFlowNodes = graphData.nodes.map(n => ({
      id: n.id,
      type: n.data?.typeName || n.type || '',
      x: n.position.x,
      y: n.position.y,
      properties: n.data || {},
    }))

    const vueFlowEdges = graphData.edges.map(e => ({
      id: e.id,
      sourceNodeId: e.source,
      targetNodeId: e.target,
      sourceAnchorId: e.sourceHandle,
      targetAnchorId: e.targetHandle,
    }))

    const webConfig = {
      vueFlowData: { nodes: vueFlowNodes, edges: vueFlowEdges },
      logicFlowData: { nodes: vueFlowNodes, edges: vueFlowEdges },
      storeData: {
        nodes: flowStore.currentNodes,
        edges: flowStore.currentEdges,
        inputParameters: flowStore.currentInputParameters,
        sessionVariables: flowStore.currentSessionVariables,
      },
      designerConfig: {
        flowType: flowType.value,
        lastModified: new Date().toISOString(),
        version: '2.0.0',
      },
    }

    return JSON.stringify(webConfig)
  }

  const saveFlow = async (): Promise<boolean> => {
    if (!flowId.value) {
      ElMessage.error(t('flowDesigner.cannotSaveWithoutFlowId'))
      return false
    }

    try {
      const graphData = getGraphData()

      graphData.nodes.forEach((vfNode) => {
        flowStore.updateNodePosition(vfNode.id, vfNode.position.x, vfNode.position.y)
      })

      flowStore.currentFlow?.edges.splice(0)
      graphData.edges.forEach((vfEdge) => {
        flowStore.addEdge({
          id: vfEdge.id,
          sourceNodeId: vfEdge.source,
          targetNodeId: vfEdge.target,
          sourceAnchorId: vfEdge.sourceHandle || undefined,
          targetAnchorId: vfEdge.targetHandle || undefined,
        })
      })

      const validationIssues = validateFlowGraph({
        nodes: flowStore.currentNodes,
        edges: flowStore.currentEdges,
      })
      if (validationIssues.length > 0) {
        await ElMessageBox.alert(
          formatValidationMessages(validationIssues, t),
          t('flowDesigner.validationFailedTitle'),
          {
            confirmButtonText: t('common.confirm'),
            type: 'warning',
          },
        )
        return false
      }

      const configInfoForRun = generateConfigInfoForRun()
      const configInfoForWeb = generateConfigInfoForWeb()

      saveToLocal(flowId.value, configInfoForWeb)

      const updateRequest: IUpdateFlowRequest = {
        id: flowId.value,
        configInfoForRun,
        configInfoForWeb,
      }

      const response = await FlowService.updateFlow(updateRequest)

      if (response.errCode === 0) {
        ElMessage.success(t('flowDesigner.flowSaveSuccess'))
        return true
      }
      else {
        ElMessage.error(response.errMsg || t('flowDesigner.saveFailed'))
        return false
      }
    }
    catch (error) {
      console.error('Save flow failed:', error)
      ElMessage.error(t('flowDesigner.saveFlowFailed'))
      return false
    }
  }

  return {
    loadFlowData,
    saveFlow,
    generateConfigInfoForRun,
    generateConfigInfoForWeb,
  }
}
