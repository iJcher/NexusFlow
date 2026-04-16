# LogicFlow → Vue Flow 技术迁移决策文档

## 一、背景

NexusFlow 是一个基于 Vue 3 + TypeScript 的工作流编排平台，画布引擎最初选择了 [LogicFlow](https://github.com/didi/LogicFlow)（滴滴开源，v2.1.15）。随着功能迭代深入，LogicFlow 暴露出大量架构层面的问题，严重影响开发效率和用户体验。经评估决定迁移至 [Vue Flow](https://vueflow.dev/)（基于 React Flow 的 Vue 3 移植，社区活跃度高）。

---

## 二、LogicFlow 使用过程中遇到的问题

### 2.1 SVG `foreignObject` 内 HTML 元素焦点问题（严重）

**问题描述**：LogicFlow 的自定义 HTML 节点通过 SVG `<foreignObject>` 渲染 Vue 组件。点击节点内的 `<input>`、`<textarea>`、`<select>` 等表单元素时，无法获得焦点，键盘输入被截获。

**根本原因**：
- LogicFlow 的 `BaseNode` 在父级 SVG `<g>` 元素上绑定了 `onMouseDown` 和 `onClick`，其中 `handleClick` 包含 `el.focus()` 会强制将焦点转移到 SVG 元素
- 事件从 `foreignObject` 内的 HTML 元素冒泡到 SVG `<g>` 时，跨越了 SVG/HTML 边界，`event.target` 会变为 SVG 元素，导致常规的 `stopPropagation()` 失效
- LogicFlow 使用 Mousetrap 库绑定全局键盘快捷键（如 Delete/Backspace 删除节点），即使焦点在输入框内也会被拦截

**解决代价**：
为了解决此问题，不得不实施**三层补丁**：
1. 在 `NodeBaseView` 构造函数中重写 `handleMouseDown` 和 `handleClick`，在 select 模式下直接 `return`
2. 在 widget 容器上添加 `mousedown`、`pointerdown`、`click`、`keydown`、`keyup` 五种事件的 `stopImmediatePropagation`
3. 在 `lf.container` 上注册 capture 阶段的 `keydown` 监听器，拦截 Mousetrap 快捷键

**评价**：这套方案本质上是在和框架"对抗"，脆弱且不可维护。任何 LogicFlow 版本更新都可能打破这些 hack。

### 2.2 Group 分组功能严重 bug（严重）

**问题描述**：使用 Group 插件将多个节点编组后，拖动分组时外框和子节点移动速度不一致。

**根本原因**：
- Group 插件内部维护了 `nodeGroupMap`（子节点 → 父分组的映射），但仅通过 `node:drop`/`node:add` 事件自动维护
- 手动调用 `addChild()` 时只更新了 Model 上的 `children` Set，不会更新 `nodeGroupMap`
- 移动规则 `addNodeMoveRules` 依赖 `nodeGroupMap` 判断子节点归属，导致位移计算错误
- 自定义 Group 类型（非内置 `'group'`）可能被 Group 插件忽略

**评价**：Group 插件的内部状态管理混乱，是典型的"内部实现泄漏"问题，用户无法安全地程序化操作分组。

### 2.3 需要手动管理 Vue 组件生命周期（中度）

**问题描述**：LogicFlow 的 `HtmlNode` 只提供一个 `setHtml(rootEl)` 方法来设置 DOM 内容。为了在节点中使用 Vue 组件，必须：

```typescript
// NodeBaseView.ts 中的实现
const app = createApp({
  setup() {
    provide('nodeData', dataRef)
    provide('nodeId', nodeId)
    provide('onUpdate', (patch) => { ... })
    return () => h(WidgetComponent)
  },
})
app.use(pinia)
app.use(i18n)
app.use(ElementPlus)
app.mount(container)
```

每个节点需要独立创建一个 Vue App 实例，手动注入 Pinia、i18n、Element Plus 等插件，手动管理缓存和销毁。这导致：
- 内存管理复杂（需要维护 `appCache` Map）
- 无法使用 Vue 的 `<Teleport>`、`<Suspense>` 等特性
- 每个节点是一个隔离的 Vue 应用，无法直接共享父组件的响应式状态

### 2.4 主题切换需要手动操作 DOM（轻度）

**问题描述**：LogicFlow 的画布背景、网格、边线颜色不支持 CSS 变量或响应式配置。切换暗色主题时，需要直接操作 DOM：

```typescript
const gridSvg = container.querySelector('.lf-grid svg')
gridSvg.querySelectorAll('circle').forEach(c => c.setAttribute('fill', color))
gridSvg.querySelectorAll('line').forEach(l => l.setAttribute('stroke', color))
```

这种做法脆弱且低效。

### 2.5 TypeScript 类型支持不完善（轻度）

LogicFlow 的事件系统类型定义不准确，导致合理的事件监听代码产生 TypeScript 编译错误：
```
// node:click 的 properties 类型为 PropertiesType | undefined
// 但实际运行时一定有值，需要强制类型断言
// connection:not-allowed 的 msg 类型为 string | undefined
```

### 2.6 缩放下的坐标系不一致（轻度）

画布缩放后（如 `lf.zoom(0.88)`），Group 插件的子节点位移计算未正确应用缩放因子，导致分组和子节点的视觉位置在拖动时产生累积偏差。

### 2.7 持久化需要双重数据源同步

由于 LogicFlow 维护了自己的内部数据（通过 `getGraphData()` 获取），与 Pinia Store 中的数据是两套独立的状态，每次保存/加载都需要手动同步，容易出现不一致。

---

## 三、为什么选择 Vue Flow

### 3.1 Vue Flow 的核心优势

| 维度 | LogicFlow | Vue Flow |
|------|-----------|----------|
| **自定义节点** | 通过 `HtmlNode` 在 SVG `foreignObject` 中渲染，需手动创建 Vue App | 直接使用 Vue SFC 作为自定义节点组件，天然支持 Composition API |
| **事件系统** | SVG 层事件拦截 HTML 交互，需多层 hack | 节点是真正的 Vue 组件，事件系统与 Vue 一致，输入框可直接聚焦 |
| **状态管理** | 内部独立状态 + 外部 Pinia，双重同步 | 提供 `useVueFlow()` composable，状态天然是 Vue 响应式的 |
| **TypeScript** | 类型定义不完善 | 完整的 TypeScript 支持 |
| **分组** | Group 插件 bug 多，内部状态混乱 | 原生支持 `parentNode` 属性实现嵌套分组 |
| **主题** | 需要 DOM 操作 | 支持 CSS 变量和 class 自定义 |
| **社区** | 滴滴团队维护，更新较慢 | 基于 React Flow 生态，社区活跃，插件丰富 |
| **包体积** | `@logicflow/core` + `@logicflow/extension` | `@vue-flow/core`，按需引入 |

### 3.2 Vue Flow 解决的核心痛点

1. **焦点问题彻底消失**：自定义节点就是 Vue 组件，`<input>` 可以直接聚焦，不存在 SVG/HTML 边界问题
2. **分组原生支持**：通过 `parentNode` 属性实现节点分组，拖动同步由框架保证
3. **单一数据源**：`useVueFlow()` 返回的 `nodes`/`edges` 就是 Vue 的 `ref`，可以直接用于 Pinia 同步
4. **Vue 生态完全兼容**：不需要手动创建独立的 Vue App，节点组件可以直接使用 `inject`、路由、状态管理等

### 3.3 面试话术提炼

> 我在项目中经历了从 LogicFlow 到 Vue Flow 的技术迁移。选择 LogicFlow 最初是因为它是国内团队维护的流程图引擎，上手快。但随着业务复杂度提升，暴露出几个严重问题：
>
> 1. **SVG foreignObject 焦点陷阱**：LogicFlow 的自定义节点渲染在 SVG foreignObject 中，节点内的 HTML 表单元素无法正常获取焦点和处理键盘事件，因为 SVG 层的事件处理器会拦截。我需要在三个层面做 hack——重写节点基类的事件处理方法、在容器上拦截事件冒泡、在 capture 阶段拦截键盘事件——才勉强解决。
>
> 2. **Group 分组移动不同步**：Group 插件内部维护了一个 nodeGroupMap，但 API 调用 addChild() 时不会同步更新这个 Map，导致分组拖动时子节点的位移计算错误。
>
> 3. **Vue 组件隔离问题**：每个自定义节点需要独立创建 Vue App 实例并手动注入 Pinia、i18n 等插件，内存管理复杂且无法共享父组件上下文。
>
> 迁移到 Vue Flow 后，自定义节点就是普通的 Vue SFC，完全没有焦点问题；状态通过 useVueFlow() composable 管理，天然与 Vue 响应式系统集成；分组通过 parentNode 属性原生支持。迁移后代码量减少约 40%，bug 率大幅下降。

---

## 四、迁移范围

### 4.1 需要重写的文件

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `composables/useLogicFlowSetup.ts` | **重写** → `useVueFlowSetup.ts` | 画布初始化、事件绑定、缩放控制 |
| `composables/useFlowPersistence.ts` | **适配** | `lf.render()` / `lf.getGraphData()` → Vue Flow 数据格式 |
| `composables/useDesignerMenus.ts` | **适配** | `lf.getPointByClient()` → Vue Flow 坐标转换 |
| `types/flow-designer/NodeBaseView.ts` | **删除** | 不再需要 HtmlNode 基类和 Vue App 手动挂载 |
| `types/flow-designer/NodeBase.ts` | **简化** | 移除 `HtmlNodeModel` 继承，保留纯数据接口 |
| `types/flow-designer/nodes/*.ts` | **简化** | 移除 LogicFlow Model/View 类，只保留数据接口和默认值 |
| `views/flow/designer/index.vue` | **重写** | `<VueFlow>` 替换 `#lf-container`，注册自定义节点类型 |
| `views/flow/designer/widgets/*.vue` | **适配** | 从 `inject('nodeData')` 改为 Vue Flow 的 `useNode()` |
| `stores/flowDesigner.ts` | **简化** | 移除 `getLogicFlowData()`/`syncFromLogicFlow()` |
| `assets/logicflow.css` | **删除** | 节点样式改在各 Widget 组件内 |

### 4.2 不受影响的文件

- `views/flow/designer/components/NodePalette.vue` — 侧边栏结构不变
- `views/flow/designer/components/CanvasControlBar.vue` — 工具栏结构不变
- `views/flow/designer/ExpressionUnits/*.vue` — 表达式编辑器不变
- `types/flow-designer/ExpressionUnits/*` — 数据类型不变
- `types/flow-designer/Parameters/*` — 变量类型不变
- `services/flow.service.ts` — 后端 API 不变

---

## 五、迁移后的架构对比

### 迁移前（LogicFlow）

```
index.vue (#lf-container)
  └── LogicFlow 实例（命令式 API）
       ├── lf.register(NodeClass)     ← 注册自定义节点
       ├── lf.render(graphData)       ← 渲染
       ├── lf.on('node:click', ...)   ← 事件监听
       └── HtmlNode → foreignObject → createApp() → Widget.vue
                                        ↑ 手动注入 Pinia/i18n/ElementPlus
```

### 迁移后（Vue Flow）

```
index.vue
  └── <VueFlow :nodes="nodes" :edges="edges">
       ├── <template #node-start="props">     ← 直接用 Vue 插槽
       │     <StartNodeWidget v-bind="props" />
       ├── <template #node-llm="props">
       │     <LLMNodeWidget v-bind="props" />
       └── useVueFlow() → 响应式 nodes/edges   ← 天然 Vue 响应式
```

---

## 六、结论

LogicFlow 作为一个流程图引擎，其核心设计基于 SVG 渲染 + 命令式 API，与 Vue 3 的声明式 + Composition API 范式存在根本性的架构冲突。当自定义节点需要复杂的 HTML 交互（表单、编辑器、下拉框等）时，SVG `foreignObject` 带来的事件边界问题几乎不可避免。

Vue Flow 从设计之初就是为 Vue 3 构建的，自定义节点是原生 Vue 组件，完全规避了上述问题。虽然迁移有一定工作量，但迁移后的代码更简洁、更可维护、bug 更少，是一笔值得的技术投资。
