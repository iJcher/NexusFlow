# LogicFlow foreignObject 内 HTML 元素聚焦问题

## 问题描述

在 NexusFlow 工作流设计器中，我们使用 LogicFlow 实现节点画布。每个节点通过 `HtmlNode` 的 `foreignObject` 机制，内部挂载了 Vue 3 SFC Widget（含 `<input>`、`<select>`、`<textarea>` 等 Element Plus 组件）。

**核心问题**：在画布上点击节点内的输入框时，无法获得焦点，点击后只能选中节点本身，而非输入框。在成功聚焦后，按下 Delete/Backspace 键会删除节点而非删除文字。

## 根因分析

### 1. SVG `<g>` 层的事件劫持

LogicFlow 的 `BaseNode`（Preact 组件）在 SVG `<g>` 元素上绑定了 `onMouseDown` 和 `onClick` 处理器：

```
// BaseNode.js 第 465 行
nodeShape = <g onMouseDown={this.handleMouseDown} onClick={this.handleClick} ...>
```

- **`handleMouseDown`**（第 276 行）：启动节点拖拽（`StepDrag`）
- **`handleClick`**（第 247-249 行）：使用 `requestAnimationFrame` 强制将焦点设回 SVG `<g>` 元素

```javascript
// handleClick 中的焦点偷取代码
var el_1 = e.currentTarget; // <g> SVG 元素
rAF(function () {
    el_1.focus(); // 偷走了 input 的焦点
});
```

当点击 `foreignObject` 内部的 HTML `<input>` 时：
1. 事件在 HTML DOM 中冒泡（input → widget-container → foreignObject）
2. 事件穿越 foreignObject 边界进入 SVG DOM
3. 到达 `<g>` 元素，触发 `handleMouseDown`（启动拖拽）和 `handleClick`（偷焦点）

### 2. Mousetrap 键盘快捷键劫持

LogicFlow 使用 Mousetrap 库绑定了全局键盘快捷键（`keyboard: { enabled: true }`）：

```javascript
// shortcut.js 第 173 行
keyboard.on(['backspace'], function () {
    // 删除选中的节点和边
    elements.edges.forEach(edge => lf.deleteEdge(edge.id));
    elements.nodes.forEach(node => lf.deleteNode(node.id));
});
```

Mousetrap 绑定在 `lf.container` 上。输入框中的 Delete/Backspace 事件会冒泡到 container，被 Mousetrap 捕获并执行节点删除。

### 3. 与 Vue Flow 的根本差异

参考项目 `matrix-number` 使用 Vue Flow（`@vue-flow/core`），节点是**纯 HTML DOM 元素**，不存在 SVG `<foreignObject>` 边界问题。Vue Flow 通过 `nodrag` / `nopan` CSS class 控制交互，事件模型完全在 HTML 层面，不会被 SVG 层劫持。

## 中途解决尝试（均未完全解决）

### 尝试 1：`container.stopPropagation()`

在 `widget-container` 的 `mousedown` 事件上调用 `e.stopPropagation()`。

```javascript
container.addEventListener('mousedown', (e) => {
  if (NodeBaseView.selectMode) e.stopPropagation()
})
```

**结果**：无效。`stopPropagation()` 只在 HTML DOM 层面阻止冒泡。在部分浏览器实现中，`foreignObject` 边界会生成**独立的 SVG 事件**，与 HTML 事件的传播链是分离的，因此 SVG `<g>` 上的处理器仍然被触发。

### 尝试 2：多事件 + `stopImmediatePropagation`

同时拦截 `mousedown`、`pointerdown`、`click` 三种事件，使用更激进的 `stopImmediatePropagation`。

**结果**：仍然无效。根本原因同上 —— SVG 层的事件处理独立于 foreignObject 内部的 HTML 事件链。

### 尝试 3：条件性 target 检测

在构造函数中包装 `handleMouseDown`/`handleClick`，检测 `ev.target.closest('.widget-container')`：

```javascript
this.handleMouseDown = (ev) => {
  if (NodeBaseView.selectMode) {
    const target = ev.target as Element | null
    if (target?.closest?.('.widget-container')) return
  }
  origMouseDown(ev)
}
```

**结果**：部分浏览器下无效。当 SVG 层生成独立事件时，`ev.target` 可能是 `foreignObject` 或 `<g>` SVG 元素本身，而非 HTML `<input>`，导致 `.closest('.widget-container')` 返回 `null`，拦截失效。

### 尝试 4：CSS `pointer-events` 分层控制

在 select 模式下设置：
- `.lf-node-content` → `pointer-events: none`
- `foreignObject` / `.widget-container` → `pointer-events: all`

**结果**：不能完全解决。`pointer-events: none` 只控制元素是否成为事件目标，不阻止子元素事件的冒泡穿透。

## 最终解决方案

参考 `matrix-number` 项目（Vue Flow）的模式隔离设计，采用**三层防线**：

### 第一层（核心）：构造函数中无条件拦截

在 `NodeBaseView` 构造函数中，在 select 模式下**完全跳过** LogicFlow 的 `handleMouseDown` 和 `handleClick`，不做任何 target 判断：

```typescript
constructor(props: any) {
  super(props)

  const origMouseDown = this.handleMouseDown
  this.handleMouseDown = (ev: MouseEvent) => {
    if (NodeBaseView.selectMode) return // 完全跳过
    origMouseDown(ev)
  }

  const origClick = this.handleClick
  this.handleClick = (ev: MouseEvent) => {
    if (NodeBaseView.selectMode) return // 完全跳过
    origClick(ev)
  }
}
```

**原理**：`handleMouseDown` 和 `handleClick` 是 `BaseNode` 构造函数中设置的实例属性（非原型方法），子类构造函数中可以直接覆盖。无论 `ev.target` 是 HTML 元素还是 SVG 元素，只要处于 select 模式就不执行，彻底避免焦点偷取。

### 第二层（保险）：容器事件拦截

在 `widget-container` 上注册 `mousedown`、`pointerdown`、`click`、`keydown` 事件监听：

```javascript
const stopIfSelect = (e: Event) => {
  if (NodeBaseView.selectMode) {
    e.stopPropagation()
    e.stopImmediatePropagation()
  }
}
container.addEventListener('mousedown', stopIfSelect)
container.addEventListener('pointerdown', stopIfSelect)
container.addEventListener('click', stopIfSelect)
container.addEventListener('keydown', stopIfSelect) // 阻止 Mousetrap 拦截 Delete/Backspace
```

### 第三层（辅助）：CSS + LogicFlow 配置

1. **LogicFlow 编辑配置**：`stopMoveGraph: true` + `adjustNodePosition: false`
2. **CSS class 切换**：`.select-mode` 添加到 canvas 容器，控制 `pointer-events` 和光标样式
3. **canvas 光标**：select 模式 → `cursor: default`；move 模式 → `cursor: grab`

### 模式切换逻辑

```typescript
const setCanvasMode = (mode: 'move' | 'select') => {
  canvasMode.value = mode
  NodeBaseView.selectMode = (mode === 'select')

  lf.updateEditConfig({
    stopMoveGraph: mode === 'select',
    adjustNodePosition: mode !== 'select',
  })

  lfContainer.classList.toggle('select-mode', mode === 'select')
}
```

## 关键文件

| 文件 | 作用 |
|------|------|
| `src/types/flow-designer/NodeBaseView.ts` | 核心：构造函数拦截 + 容器事件 + Widget 挂载 |
| `src/composables/useLogicFlowSetup.ts` | 模式切换 `setCanvasMode` + LogicFlow 配置 |
| `src/views/flow/designer/index.vue` | CSS 辅助规则 + 键盘快捷键守卫 |
| `src/views/flow/designer/components/NodePalette.vue` | 模式切换 UI（单按钮图标切换） |

## 教训总结

1. **SVG `<foreignObject>` 的事件模型与纯 HTML 不同**：不能假设 `stopPropagation()` 能跨越 foreignObject 边界生效
2. **拦截事件处理器本身比拦截事件传播更可靠**：直接在构造函数中包装处理器，而非试图在传播链上拦截
3. **模式隔离是最清晰的设计**：参考 Vue Flow 项目的 `mouseMode` 设计，编辑模式完全交给 HTML 层，移动模式完全交给 Canvas 层
