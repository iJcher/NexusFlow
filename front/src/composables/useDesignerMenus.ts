import { ref } from 'vue'
import type LogicFlow from '@logicflow/core'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useFlowDesignerStore } from '@/stores/flowDesigner'

export function useDesignerMenus() {
  const { t } = useI18n()
  const flowStore = useFlowDesignerStore()

  const contextMenuVisible = ref(false)
  const contextMenuPosition = ref({ x: 0, y: 0 })
  const clickPosition = ref({ x: 0, y: 0 })

  const nodeContextMenuVisible = ref(false)
  const nodeContextMenuPosition = ref({ x: 0, y: 0 })
  const contextMenuTargetType = ref<'node' | 'edge' | null>(null)
  const contextMenuTargetId = ref<string | null>(null)


  const closeContextMenu = (rightMenuRef?: { closeSelector: () => void } | null) => {
    contextMenuVisible.value = false
    rightMenuRef?.closeSelector()
  }

  const closeNodeContextMenu = () => {
    nodeContextMenuVisible.value = false
    contextMenuTargetType.value = null
    contextMenuTargetId.value = null
  }

  const closeAllMenus = (rightMenuRef?: { closeSelector: () => void } | null) => {
    closeContextMenu(rightMenuRef)
    closeNodeContextMenu()
  }

  const handleCanvasContextMenu = (event: MouseEvent, lf: LogicFlow | null) => {
    const target = event.target as HTMLElement
    if (target.closest('.lf-node') || target.closest('.lf-edge')) return

    contextMenuPosition.value = { x: event.clientX, y: event.clientY }

    if (lf) {
      const point = lf.getPointByClient(event.clientX, event.clientY)
      clickPosition.value = {
        x: point.canvasOverlayPosition.x,
        y: point.canvasOverlayPosition.y,
      }
    }

    contextMenuVisible.value = true
    event.stopPropagation()
  }

  const handleDeleteTarget = (targetType: 'node' | 'edge', targetId: string, lf: LogicFlow | null) => {
    if (!lf) return

    if (targetType === 'node') {
      lf.deleteNode(targetId)
      ElMessage.success(t('flowDesigner.nodeDeleted'))
    }
    else if (targetType === 'edge') {
      lf.deleteEdge(targetId)
      ElMessage.success(t('flowDesigner.edgeDeleted'))
    }
  }

  return {
    contextMenuVisible,
    contextMenuPosition,
    clickPosition,
    nodeContextMenuVisible,
    nodeContextMenuPosition,
    contextMenuTargetType,
    contextMenuTargetId,
    closeContextMenu,
    closeNodeContextMenu,
    closeAllMenus,
    handleCanvasContextMenu,
    handleDeleteTarget,
  }
}
