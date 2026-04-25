import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import type LogicFlow from '@logicflow/core'
import type { Ref } from 'vue'
import { FlowService } from '@/services/flow.service'
import { useFlowDesignerStore } from '@/stores/flowDesigner'
import type { IFlowConfigInfo, IUpdateFlowRequest } from '@/types/flow.types'
import type { NodeBase } from '@/types/flow-designer/NodeBase'
import type { NodeLine } from '@/types/flow-designer/NodeLine'

const LOCAL_STORAGE_PREFIX = 'nf_flow_web_'

function saveToLocal(flowId: number | string, webConfigJson: string) {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${flowId}`, webConfigJson)
  } catch { /* quota exceeded etc */ }
}

function loadFromLocal(flowId: number | string): string | null {
  try {
    return localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${flowId}`)
  } catch { return null }
}

export function useFlowPersistence(
  flowType: Ref<string>,
  flowId: Ref<number | null>,
  currentFlowName: Ref<string>,
  getLf: () => LogicFlow | null,
) {
  const { t } = useI18n()
  const flowStore = useFlowDesignerStore()

  const renderWebConfig = (webConfig: any, lf: LogicFlow, id: number) => {
    if (webConfig.storeData) {
      flowStore.setFlowData(id.toString(), {
        nodes: webConfig.storeData.nodes || [],
        edges: webConfig.storeData.edges || [],
        inputParameters: webConfig.storeData.inputParameters || [],
        sessionVariables: webConfig.storeData.sessionVariables || [],
        name: currentFlowName.value,
      })
    }

    if (webConfig.logicFlowData) {
      if (webConfig.logicFlowData.edges) {
        webConfig.logicFlowData.edges = webConfig.logicFlowData.edges.map((edge: Record<string, unknown>) => ({
          ...edge,
          type: 'customBezier',
        }))
      }
      console.debug('[FlowPersistence] render positions:',
        webConfig.logicFlowData.nodes?.map((n: any) => `${n.id}(${Math.round(n.x)},${Math.round(n.y)})`).join(' | '))
      lf.render(webConfig.logicFlowData)
    }

    if (!webConfig.storeData) {
      setTimeout(() => {
        const currentLf = getLf()
        if (currentLf) {
          const currentGraphData = currentLf.getGraphData() as { nodes: { id: string, type: string, x: number, y: number, properties: NodeBase }[], edges: { id: string, sourceNodeId: string, targetNodeId: string, startPoint?: { x: number, y: number }, endPoint?: { x: number, y: number } }[] }
          flowStore.syncFromLogicFlow(currentGraphData)
        }
      }, 100)
    }
  }

  const loadFlowData = async (id: number) => {
    const lf = getLf()
    try {
      const response = await FlowService.getFlowById(id)
      if (response.errCode === 0 && response.data) {
        const flowData = response.data
        currentFlowName.value = flowData.displayName || t('flowDesigner.unnamedFlow')

        let webConfigSource: string | null = null

        if (flowData.configInfoForWeb) {
          webConfigSource = flowData.configInfoForWeb
          console.debug('[FlowPersistence] loaded configInfoForWeb from API, length=', webConfigSource.length)
        } else {
          webConfigSource = loadFromLocal(id)
          if (webConfigSource) {
            console.warn('[FlowPersistence] API returned no configInfoForWeb, using localStorage fallback')
          }
        }

        if (webConfigSource && lf) {
          try {
            const webConfig = JSON.parse(webConfigSource)
            renderWebConfig(webConfig, lf, id)
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

          lf?.render({ nodes: [], edges: [] })
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

          lf?.render({ nodes: [], edges: [] })
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
    const lf = getLf()
    const webConfig = {
      logicFlowData: lf?.getGraphData() || { nodes: [], edges: [] },
      storeData: {
        nodes: flowStore.currentNodes,
        edges: flowStore.currentEdges,
        inputParameters: flowStore.currentInputParameters,
        sessionVariables: flowStore.currentSessionVariables,
      },
      designerConfig: {
        flowType: flowType.value,
        lastModified: new Date().toISOString(),
        version: '1.0.0',
      },
    }

    return JSON.stringify(webConfig)
  }

  const saveFlow = async () => {
    const lf = getLf()
    if (!lf) {
      ElMessage.error(t('flowDesigner.canvasNotInitialized'))
      return
    }

    if (!flowId.value) {
      ElMessage.error(t('flowDesigner.cannotSaveWithoutFlowId'))
      return
    }

    try {
      const currentGraphData = lf.getGraphData() as { nodes: { id: string, x: number, y: number }[], edges: { id: string, sourceNodeId: string, targetNodeId: string, startPoint?: { x: number, y: number }, endPoint?: { x: number, y: number } }[] }

      currentGraphData.nodes.forEach((lfNode) => {
        const existingNode = flowStore.currentNodes.find(n => n.id === lfNode.id)
        if (existingNode) {
          flowStore.updateNodePosition(lfNode.id, lfNode.x, lfNode.y)
        }
      })

      flowStore.currentFlow?.edges.splice(0)
      currentGraphData.edges.forEach((lfEdge) => {
        const edgeModel = lf.getEdgeModelById(lfEdge.id)
        flowStore.addEdge({
          id: lfEdge.id,
          sourceNodeId: lfEdge.sourceNodeId,
          targetNodeId: lfEdge.targetNodeId,
          sourceAnchorId: edgeModel?.sourceAnchorId,
          targetAnchorId: edgeModel?.targetAnchorId,
          startPoint: lfEdge.startPoint,
          endPoint: lfEdge.endPoint,
        })
      })

      const configInfoForRun = generateConfigInfoForRun()
      const configInfoForWeb = generateConfigInfoForWeb()

      console.debug('[FlowPersistence] saving positions:',
        currentGraphData.nodes.map(n => `${n.id}(${Math.round(n.x)},${Math.round(n.y)})`).join(' | '))
      console.debug('[FlowPersistence] configInfoForWeb length:', configInfoForWeb.length)

      saveToLocal(flowId.value, configInfoForWeb)

      const updateRequest: IUpdateFlowRequest = {
        id: flowId.value,
        configInfoForRun,
        configInfoForWeb,
      }

      const response = await FlowService.updateFlow(updateRequest)

      if (response.errCode === 0) {
        ElMessage.success(t('flowDesigner.flowSaveSuccess'))
      }
      else {
        ElMessage.error(response.errMsg || t('flowDesigner.saveFailed'))
      }
    }
    catch (error) {
      console.error('Save flow failed:', error)
      ElMessage.error(t('flowDesigner.saveFlowFailed'))
    }
  }

  return {
    loadFlowData,
    saveFlow,
    generateConfigInfoForRun,
    generateConfigInfoForWeb,
  }
}
