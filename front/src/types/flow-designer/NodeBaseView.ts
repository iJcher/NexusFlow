import { HtmlNode } from '@logicflow/core'
import { createApp, ref, h, provide, type App, type Ref, type Component } from 'vue'
import ElementPlus from 'element-plus'
import { pinia } from '@/plugins/pinia'
import i18n from '@/locales'

interface WidgetCache {
  app: App
  dataRef: Ref<Record<string, any>>
}

/**
 * LogicFlow HtmlNode 基类，在节点内部挂载 Vue Widget 组件。
 * 子类只需实现 getWidgetComponent() 返回对应 Widget SFC 即可。
 *
 * 在 select 模式下，拦截 LogicFlow 的 handleMouseDown / handleClick，
 * 防止 SVG <g> 层的事件处理器抢走 foreignObject 内 HTML 元素的焦点。
 */
export class NodeBaseView extends HtmlNode {
  private static appCache = new Map<string, WidgetCache>()
  static selectMode = false

  constructor(props: any) {
    super(props)

    const origMouseDown = this.handleMouseDown
    this.handleMouseDown = (ev: MouseEvent) => {
      if (NodeBaseView.selectMode) return
      origMouseDown(ev)
    }

    const origClick = this.handleClick
    this.handleClick = (ev: MouseEvent) => {
      if (NodeBaseView.selectMode) return
      origClick(ev)
    }
  }

  protected getWidgetComponent(): Component {
    throw new Error('Subclass must implement getWidgetComponent()')
  }

  setHtml(rootEl: SVGForeignObjectElement) {
    const nodeId = this.props.model.id
    const properties = this.props.model.properties as Record<string, any>

    const cached = NodeBaseView.appCache.get(nodeId)
    if (cached) {
      cached.dataRef.value = { ...properties }
      return
    }

    const dataRef = ref<Record<string, any>>({ ...properties })
    const container = document.createElement('div')
    container.className = 'widget-container'
    container.style.width = '100%'
    container.style.height = '100%'
    container.style.boxSizing = 'border-box'
    container.style.overflow = 'hidden'

    const stopIfSelect = (e: Event) => {
      if (NodeBaseView.selectMode) {
        e.stopPropagation()
        e.stopImmediatePropagation()
      }
    }
    container.addEventListener('mousedown', stopIfSelect)
    container.addEventListener('pointerdown', stopIfSelect)
    container.addEventListener('click', stopIfSelect)
    container.addEventListener('keydown', stopIfSelect)
    container.addEventListener('keyup', stopIfSelect)

    rootEl.innerHTML = ''
    rootEl.appendChild(container)

    const WidgetComponent = this.getWidgetComponent()
    const modelRef = this.props.model

    const app = createApp({
      setup() {
        provide('nodeData', dataRef)
        provide('nodeId', nodeId)
        provide('onUpdate', (patch: Record<string, any>) => {
          const newProps = { ...modelRef.properties, ...patch }
          modelRef.setProperties(newProps)
        })
        provide('onResize', (width: number, height: number) => {
          modelRef.width = width
          modelRef.height = height
        })
        return () => h(WidgetComponent)
      },
    })

    app.use(pinia)
    app.use(i18n)
    app.use(ElementPlus)
    app.mount(container)

    NodeBaseView.appCache.set(nodeId, { app, dataRef })
  }

  static destroyWidget(nodeId: string) {
    const cached = NodeBaseView.appCache.get(nodeId)
    if (cached) {
      cached.app.unmount()
      NodeBaseView.appCache.delete(nodeId)
    }
  }

  static clearAllWidgets() {
    NodeBaseView.appCache.forEach(({ app }) => app.unmount())
    NodeBaseView.appCache.clear()
  }
}
