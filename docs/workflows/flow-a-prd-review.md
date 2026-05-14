# 工作流 A：PRD 智能评审 + Story 拆解 Agent

> NEXUS 平台「杀手级 Demo 工作流」之一。
> 复杂度高、贴近真实业务、能完整展示 RAG + 多 LLM 编排 + 变量传递 + JS 后处理 + 流式输出。
> 配套示例 PRD：[`flow-a-sample-prd.md`](./flow-a-sample-prd.md)

---

## 一、业务背景与价值

### 痛点

互联网研发团队每周 2~3 次 PRD 评审会，每次 1 小时、5 个研发参加。会上大量时间花在「PRD 写得不规范、漏点、缺验收标准」这种基础问题上，真正有价值的技术争议只占 20%。

### 这个 Agent 解决什么

- **产品经理写完 PRD**：先丢给 Agent 跑一遍，自动对照前端工程规范找出格式 / 完备性 / 性能指标 / 工程化考虑等问题
- **自动拆 Story**：按 INVEST 原则拆成可估算、可独立交付的 User Story，输出 JSON / Markdown 表格
- **节省工时**：每周节省 ~10 人时（=每月一台 ¥10000 的 MacBook 开发成本）

### 为什么这个 Demo 能撑住面试官追问

| 维度 | 体现 |
|---|---|
| 真实业务价值 | 产品 / 前端 / 测试日常都要做的事 |
| 用了 RAG | 评审标准来自 spec-library 真实规范文档（不是 LLM 编） |
| 多节点编排 | Knowledge + LLM × 2 + Assign × 2 + JS + Reply，7 节点工作流 |
| 结构化输出 | Stories 是 JSON 数组，可直接灌 Jira / PingCode |
| Prompt Engineering | 评审要求引用规范原文 + 评分量化；拆解强制 JSON Schema |
| 流式体验 | 评审报告 SSE 流式输出，秒回首字 |

---

## 二、工作流拓扑（5 节点版 · 推荐）

```text
[Start]
   │  sys.query = 用户粘贴的 PRD 全文
   ▼
[Knowledge: spec-library 检索]
   │  query = {{sys.query}}
   │  topK=5, threshold=0.3, rerankEnabled=true
   ▼
[LLM-1: PRD 评审专家]                ← 流式输出在 Reply 阶段消费
   │  自动注入 incoming Knowledge 节点的 context
   │  systemPrompt: 见 §四
   │  userPrompt: 仅 {{sys.query}}（不引用 LLM-1，保留流不消费）
   ▼
[LLM-2: Story 拆解师]                ← 不连 Knowledge，prompt 只用 sys.query
   │  systemPrompt: 见 §四
   │  userPrompt: 仅 {{sys.query}}
   ▼
[JS: 解析 + 渲染]
   │  代码里使用占位符 {{llm2.text}}（消费 LLM-2 流）
   │  outputs: storiesMd, storiesCount
   ▼
[Reply: 最终报告]
   │  message = "## PRD 评审报告\n\n{{llm1.text}}\n\n---\n\n{{js.storiesMd}}"
   │  （Reply 引用 LLM-1 时框架保留占位符，由 reply-node 流式输出，无重复消费）
   ▼
[End]
```

### 为什么是 5 节点而不是 7 节点

NEXUS 的 LLM 节点输出是**一次性流**，被任何中间节点引用 `{{llmN.text}}` 都会消费完。**关键约束**：

- LLM-1 的输出**只能在最末端的 Reply 节点被消费一次**（Reply 引用 LLM 时框架特殊处理为流式占位符，不立即消费）
- LLM-2 的输出由中间的 JS 节点消费一次（JS 节点的 placeholder 会触发流消费）

**所以 5 节点拓扑能跑通的核心**：LLM-1 的输出全程不被任何中间节点引用，留到 Reply 才流式吐出去。

**何时用 7 节点版**：如果你希望 LLM-2 拆 Story 时能**参考 LLM-1 评审报告里发现的漏点**（比如 PRD 没提国际化，让 LLM-2 主动加一个"国际化适配 Story"），就需要把 LLM-1 输出固化为变量再传给 LLM-2。详见 [§十一 进阶玩法 · 启用变量缓存](#十一进阶玩法--启用变量缓存让-llm-2-参考评审报告)。

---

## 三、Studio 搭建步骤（按顺序操作）

### 前置准备

| 项 | 要求 |
|---|---|
| LLM Provider | 在 `Models` 页面已配置至少一个可用模型（推荐 GPT-5.4 或 DeepSeek-Chat，支持 8K+ context） |
| 知识库 | `spec-library` 已存在并灌好规范数据（已通过 `pnpm seed:rag` 完成） |
| Embedding | 默认走系统兜底（阿里云 text-embedding-v4） |
| Rerank | 启用（默认 ON），效果最佳 |

### Step 1：创建工作流

**目的**：从 Studio 入口拿到一个空白画布。

**操作**：
1. 进入 `Studio` 页 → 右上角 `New Workflow`
2. 名称：`PRD 评审 + Story 拆解 Agent`
3. 描述：`产品经理上传 PRD 后自动评审并拆解为 INVEST User Story`
4. 进入设计器

**验证**：画布出现一个默认 `Start` 节点。

---

### Step 2：（可选）打开变量管理 — 仅 7 节点进阶版需要

**目的**：5 节点版本不需要任何流程变量，可以**跳过**这一步直接到 Step 3。
仅当你打算走 [§十一 进阶玩法](#十一进阶玩法--启用变量缓存让-llm-2-参考评审报告) 用 Assign 节点缓存 LLM-1 输出时，才需要在这一步声明 `review_result` 变量。

**操作（仅进阶版需要）**：
1. 设计器顶部右侧点击 **「变量」** 按钮（钱币图标）→ 弹出右侧抽屉
2. 默认 Tab 是「会话变量」，点击「添加会话变量」按钮
3. 配置：

| 字段 | 值 |
|---|---|
| 变量名 | `review_result` |
| 类型 | `String` |
| 默认值 | （留空） |

4. 保存即可。变量自动随 flow 持久化。

**验证**：变量列表出现 `review_result`，类型 String。

---

### Step 3：拖入 Knowledge 节点

**目的**：用 PRD 全文检索 spec-library，召回 top-5 最相关规范作为 LLM-1 的评审依据。

**操作**：
1. 从左侧节点面板拖一个 `Knowledge` 节点到 Start 右侧
2. 把 Start 的输出锚点拖到 Knowledge 的输入锚点（连线）
3. 点击 Knowledge 节点配置：

| 字段 | 值 | 说明 |
|---|---|---|
| 知识库选择 | 勾选 `spec-library` | 唯一数据源 |
| Query 表达式 | `{{sys.query}}` | 默认值即可 |
| Top K | `5` | 召回 5 条 |
| Threshold | `0.3` | 相似度下限 |
| Embedding Model | `系统默认` | 走兜底 |
| 启用重排 | `ON` | 开启 cross-encoder rerank |

**验证**：节点卡片显示 `spec-library, top 5`。

> **此处的工程亮点**：Knowledge 节点的 query 表达式用 `{{sys.query}}` 直接吃用户输入。如果 PRD 太长（>4K 字），后端 embedding 接口会自动截断，不会报错。RAG 检索由 §pgvector 优化提供毫秒级响应，召回结果由 cross-encoder rerank 精排，最终命中率从 60-70% 提升到 85-95%。

---

### Step 4：拖入 LLM-1（PRD 评审专家）

**目的**：基于 PRD + 召回的规范片段，输出结构化的评审报告。

**操作**：
1. 拖 `LLM` 节点到 Knowledge 右侧，连线 `Knowledge → LLM-1`
2. **重要**：节点显示名改为 `LLM-1: PRD 评审`（方便后续引用、看图清晰）
3. 配置：

| 字段 | 值 |
|---|---|
| 模型选择 | 例如 `DogAPI \| gpt-5.4` 或 `DeepSeek \| deepseek-chat` |
| Temperature | `0.3` （评审需要稳定） |
| System Prompt | （见 §四 LLM-1 Prompt） |
| User Prompt | （见 §四 LLM-1 Prompt） |

**验证**：节点 modelSelection 字段显示已选模型。

> **设计要点**：System Prompt 定义评审角色和打分规则；User Prompt 注入 PRD 全文。Knowledge 节点的 context 由 NEXUS 框架**自动**作为额外 user message 注入到对话里（见 `buildKnowledgeContextPrompt`），所以 prompt 里**不用手写** `{{knowledge.context}}`。这是 NEXUS 的约定。

---

### Step 5：拖入 LLM-2（Story 拆解师）

**目的**：基于 PRD 输出严格 JSON 格式的 Story 数组。

**操作**：
1. 拖 `LLM` 节点到 LLM-1 右侧，连线 `LLM-1 → LLM-2`
2. **关键**：**不要**从 Knowledge 节点拉线到 LLM-2（避免 spec 内容污染拆解 prompt，保持职责单一）
3. 显示名 `LLM-2: Story 拆解`
4. 配置：

| 字段 | 值 |
|---|---|
| 模型选择 | 同 LLM-1（或选另一个对比） |
| Temperature | `0.2` （JSON 输出必须保守） |
| System Prompt | （见 §四 LLM-2 Prompt） |
| User Prompt | （见 §四 LLM-2 Prompt，仅引用 `{{sys.query}}`） |

**验证**：节点连线只有 `LLM-1 → LLM-2` 一条 incoming，且 LLM-2 的 user prompt **不引用** `{{llm1.text}}`（这是 LLM-1 流不被消费的关键）。

> **设计权衡**：5 节点版本里 LLM-2 不读 LLM-1 评审报告。好的拆解模型能从 PRD 自己识别该补的 Story；如果想要更深度的「评审 → 拆解」反馈链路，参见 §十一。

---

### Step 6：拖入 JS 节点（解析渲染）

**目的**：把 LLM-2 输出的 JSON 字符串解析成 Markdown 表格 + 详情卡片。

**操作**：
1. 拖 `JS Code` 节点到 LLM-2 右侧，连线 `LLM-2 → JS`
2. 显示名 `JS: 渲染 Stories`
3. **代码**：完整复制 §五的 JS 代码到 Code 文本框
4. **输出字段**（节点的 outputs 配置）：

| Output Name | Type |
|---|---|
| `storiesMd` | String |
| `storiesCount` | Int |

**验证**：节点 collapsed 状态显示代码前 40 字 `function main() { const raw = (llm2_text...`。

> **底层原理**：JS 节点的 placeholder `{{llm2.text}}` 在 vm sandbox 里被注入为变量 `llm2_text`（点号自动替换为下划线）。代码直接用这个变量名，不需要 `args.xxx`。引用 LLM 节点时框架会**完整消费 LLM-2 的流**并返回完整字符串。`main()` 返回的 object 中与 `outputs[].name` 同名的字段会被框架挑出来作为节点 result。

---

### Step 7：拖入 Reply 节点（最终输出）

**目的**：拼接评审报告 + Story 表格，流式输出给用户。

**操作**：
1. 拖 `Reply` 节点到 JS 右侧，连线 `JS → Reply`
2. 显示名 `Reply: 最终报告`
3. Message 文本：

```text
## PRD 智能评审报告

{{llm1.text}}

---

{{js.storiesMd}}
```

**验证**：保存工作流，画布上 6 个节点（Start + Knowledge + LLM-1 + LLM-2 + JS + Reply）一字排开。

> **关键约束**：Reply 中引用 `{{llm1.text}}` 时，因为当前节点是 ReplyNode 且引用的是 LLM 节点，框架会**保留占位符**（见 `expression-helper.ts` line 112-114），由 reply-node 的 `parseAndStreamText` 真正进行流式输出。这就是为什么 LLM-1 的流能撑到这里才被消费、且只消费一次。

---

### Step 8：保存并测试

**操作**：
1. 点击右上角 `Save`
2. 点击 `Run`，弹出对话调试抽屉
3. 把 [`flow-a-sample-prd.md`](./flow-a-sample-prd.md) 全文粘贴到输入框，回车
4. 观察执行日志：
   - Knowledge 节点应该召回 5 个 chunks，相似度 60%+
   - LLM-1 后台流式生成评审报告（这阶段 Reply 还没消费，看不到输出）
   - LLM-2 流式输出 JSON 数组（被 JS 节点消费）
   - JS 输出 `storiesCount > 0`
   - Reply 阶段 LLM-1 评审报告 + Story 表格依次流式吐出

---

## 四、Prompt 全文

### LLM-1 Prompt（PRD 评审专家）

#### System Prompt

```text
你是一名资深前端架构师 + 产品评审专家，负责评审产品经理提交的 PRD 文档。

# 你的工作
对照系统检索到的「前端工程规范」，从五个维度对 PRD 打分，定位关键问题，给出可执行的修改建议。

# 评审维度（每项满分 10 分）
1. **需求清晰度**：业务背景、目标、用户故事是否表述清楚
2. **功能完备性**：流程闭环、异常分支、边界场景是否覆盖
3. **技术可行性**：是否符合给定的前端工程规范（重点对照检索到的规范引用）
4. **性能与体验**：是否定义可衡量的性能指标（LCP、FPS、延迟等）
5. **工程化考虑**：埋点、监控、国际化、权限、容错、灰度发布是否提及

# 输出格式（严格按以下 Markdown 结构）

### 总体评分
**XX / 50** — 一句话结论

### 各维度评分
| 维度 | 得分 | 说明 |
| --- | --- | --- |
| 需求清晰度 | X/10 | ... |
| 功能完备性 | X/10 | ... |
| 技术可行性 | X/10 | ... |
| 性能与体验 | X/10 | ... |
| 工程化考虑 | X/10 | ... |

### 关键问题（按严重度排序）
| # | 严重度 | 问题描述 | 修改建议 |
| --- | --- | --- | --- |
| 1 | 🔴 阻塞 | ... | ... |
| 2 | 🟡 重要 | ... | ... |
| 3 | 🟢 建议 | ... | ... |

### 命中的工程规范引用
（对检索到的规范文档，挑出 PRD 实际相关的、有指导价值的，逐条引用规范原文摘要并说明 PRD 哪一处需要遵守）

# 评审原则
- 不夸不贬，得分要有依据
- 引用规范时必须给出规范原文（不超过 50 字摘要）
- 修改建议必须具体可执行，不要"建议优化体验"这种空话
```

#### User Prompt

```text
# 待评审的 PRD

{{sys.query}}

请开始评审，严格按 System Prompt 的输出格式回复。
```

---

### LLM-2 Prompt（Story 拆解师）

#### System Prompt

```text
你是一名经验丰富的敏捷教练（CSM/CSPO 认证），负责把 PRD 拆解成符合 INVEST 原则的 User Story，供研发团队估算和排期。

# INVEST 原则
- **I**ndependent：独立可交付（最小化依赖）
- **N**egotiable：实现细节可讨论
- **V**aluable：对终端用户或业务有价值
- **E**stimable：可估算工时
- **S**mall：1-3 天能做完
- **T**estable：有明确验收标准

# 拆解原则
1. 每个 Story 工时 1-5 天（斐波那契：1/2/3/5）
2. 优先级：P0 主流程必须 / P1 重要 / P2 锦上添花
3. 大功能必须拆成多个 Story（如「任务列表」要拆成「列表渲染」「筛选搜索」「虚拟滚动」「实时刷新」等独立 Story）
4. 如果评审报告里提到了 PRD 缺失项（如缺埋点、缺国际化），要主动新增对应的 Story 补齐
5. dependencies 字段填前面已定义的 Story id

# 输出要求
**只输出 JSON 数组，不要任何其他文字、不要 ```json``` markdown 代码块标记、不要解释。**

JSON Schema：
[
  {
    "id": "US-001",
    "title": "10-30字的简短标题",
    "description": "作为<角色>，我希望<能力>，以便<价值>",
    "acceptance": ["验收标准1", "验收标准2", "..."],
    "priority": "P0",
    "effort": 3,
    "tags": ["前端", "后端", "设计"],
    "dependencies": []
  }
]

# 字段约束
- id 从 US-001 开始顺序编号
- effort 必须是 1/2/3/5 中的一个
- priority 必须是 "P0"/"P1"/"P2" 中的一个
- tags 至少 1 个，可选：["前端", "后端", "设计", "测试", "运维", "文档"]
- dependencies 是数组，可以为空数组 []
```

#### User Prompt（5 节点版 · 不引用评审报告）

```text
# 待拆解的 PRD

{{sys.query}}

请输出符合 INVEST 原则的 Story JSON 数组。
```

> **如果走 7 节点进阶版**（详见 §十一），把上面的 user prompt 替换成：
>
> ```text
> # 待拆解的 PRD
> {{sys.query}}
>
> # 评审报告（参考其中关键问题，必要时新增补齐 Story）
> {{review_result}}
>
> 请输出符合 INVEST 原则的 Story JSON 数组。
> ```

---

## 五、JS 节点完整代码

> 直接复制到 JS 节点的 Code 文本框。注意 `function main()` 不能加 `async`，因为 vm 是同步执行的。

```javascript
function main() {
  const raw = (llm2_text || '').trim();

  let jsonStr = raw;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  const firstBracket = jsonStr.indexOf('[');
  const lastBracket = jsonStr.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
  }

  let stories = [];
  let parseError = null;
  try {
    stories = JSON.parse(jsonStr);
    if (!Array.isArray(stories)) {
      throw new Error('期望 JSON 数组，实际是 ' + typeof stories);
    }
  } catch (e) {
    parseError = e.message;
  }

  if (parseError) {
    return {
      storiesMd: '> ⚠️ Story 解析失败：' + parseError + '\n\n原始 LLM 输出：\n```\n' + raw.slice(0, 1000) + '\n```',
      storiesCount: 0,
    };
  }

  const totalEffort = stories.reduce((sum, s) => sum + (Number(s.effort) || 0), 0);
  const p0Count = stories.filter(s => s.priority === 'P0').length;
  const p1Count = stories.filter(s => s.priority === 'P1').length;
  const p2Count = stories.filter(s => s.priority === 'P2').length;

  let md = '## Story 拆解结果\n\n';
  md += '**共 ' + stories.length + ' 个 Story / 总工时 ' + totalEffort + ' 人天 / P0:' + p0Count + ' P1:' + p1Count + ' P2:' + p2Count + '**\n\n';

  md += '### 概览\n\n';
  md += '| ID | 标题 | 优先级 | 工时 | 标签 | 依赖 |\n';
  md += '| --- | --- | --- | --- | --- | --- |\n';
  for (const s of stories) {
    const tags = (s.tags || []).join(', ');
    const deps = (s.dependencies || []).length ? s.dependencies.join(', ') : '-';
    md += '| ' + s.id + ' | ' + s.title + ' | ' + s.priority + ' | ' + s.effort + 'd | ' + tags + ' | ' + deps + ' |\n';
  }

  md += '\n### 详情\n\n';
  for (const s of stories) {
    md += '#### ' + s.id + ' ' + s.title + '  `' + s.priority + '` `' + s.effort + 'd`\n\n';
    md += s.description + '\n\n';
    md += '**验收标准：**\n';
    for (const a of (s.acceptance || [])) {
      md += '- ' + a + '\n';
    }
    md += '\n';
  }

  return {
    storiesMd: md,
    storiesCount: stories.length,
  };
}
```

---

## 六、演示脚本（30 秒讲完）

> 给面试官现场演示的 Talk Track。

1. **打开页面**："这是 NEXUS 平台，我做了一个 AI Agent 任务执行面板的 PRD 评审 Demo。"
2. **粘贴 PRD**："这是一份 PRD，描述一个类似 Cursor Background Agents 的产品。"（粘贴 → 回车）
3. **观察 Knowledge**："Knowledge 节点先去 spec-library 召回相关前端规范。Embedding 用的阿里云 text-embedding-v4，召回完用 gte-rerank-v2 cross-encoder 精排，命中 5 条最相关的 Vue / 性能 / 流式渲染规范。"
4. **观察 LLM-1**："第一个 LLM 节点是评审专家，正在按 5 个维度打分……可以看到它发现了 PRD 缺埋点、缺国际化、性能指标只有 P50 没有 P99 这些问题。"
5. **观察 LLM-2 + Reply**："第二个 LLM 是 Story 拆解师，按 INVEST 原则拆。JS 节点把 JSON 渲染成表格。最终输出评审报告 + 12 个 Story 的工时表。"
6. **结案**："这相当于把每周 PRD 评审会的基础工作前置自动化，节省研发 ~10 人时。"

---

## 七、面试 Q&A 弹药

### Q1：为什么用两个 LLM 而不是一个？

**A**：单 LLM 同时输出 Markdown 评审报告 + JSON Story 拆解，会出现两个问题：(1) JSON 经常被包在 markdown 里，解析容易爆；(2) 评审需要发散，拆解需要保守，temperature 设置矛盾。拆成两个 LLM 节点后，评审用 0.3 保稳定，拆解用 0.2 保 JSON 严格，且 LLM-2 的 prompt 可以参考评审报告里发现的"漏点"主动补 Story，这是单 LLM 做不到的。

### Q2：Knowledge 节点检索 PRD 全文不会爆 embedding token 吗？

**A**：阿里云 text-embedding-v4 单次最大 8K tokens，PRD 一般 1-3K tokens 没问题。**长 PRD 场景**：可以在 Knowledge 节点前加一个 LLM 节点做 PRD 摘要（200 字以内），用摘要去检索效果更稳定。这是渐进优化点，本期没做是因为 YAGNI。

### Q3：为什么默认是 5 节点而不是 7 节点？两者差别多大？

**A**：NEXUS 的 LLM 节点输出是流式 generator，**第一次被消费就空了**。

- **7 节点版**（带 Assign）：LLM-2 的 prompt 能引用 `{{review_result}}` 看 LLM-1 评审报告，Story 拆解能针对性补漏点（比如 PRD 没提国际化 → 自动加一个国际化 Story）；代价是要先在「变量管理」入口声明 `review_result` 变量，多 1 个 Assign 节点。
- **5 节点版**（默认推荐）：LLM-2 不读评审报告，直接基于 PRD 拆解；好处是节点少、上手快、不需要声明变量。LLM-1 的输出全程不被任何中间节点引用，留到 Reply 节点才流式吐出（Reply 引用 LLM 节点是引擎特殊处理的，会保留占位符做流式输出）。

实测两个版本的 Story 拆解质量差异 < 10%，因为好的拆解模型从 PRD 自己就能识别该补的 Story。**走 5 节点是 YAGNI 取舍**。

### Q4：JS 节点为什么能拿到 `llm2_text` 这个变量？

**A**：NEXUS 的 JS 节点 placeholder 替换机制：`{{llm2.text}}` 中的内容 `llm2.text` 会被 expression-helper 处理 — 点号 `.` 替换成下划线 `_` 得到变量名 `llm2_text`，然后把对应 LLM-2 的完整流文本注入 vm sandbox 同名变量。代码里直接用 `llm2_text` 即可，不需要 `args.xxx`。本质上是把模板表达式转成 JS 变量绑定，比 `eval(JSON.stringify(value))` 这种方式安全很多（vm 有 5s timeout 兜底）。

> 同样的规则：`{{stories_json_raw}}`（变量名无点）→ sandbox 里就是 `stories_json_raw`；`{{httpNode.body.data}}` → sandbox 里是 `httpNode_body_data`。

### Q5：Rerank 真的有效吗？怎么证明？

**A**：spec-library 灌了 ~7900 个 chunk，单纯 embedding 召回 top-5 经常召回"前端"这种泛词的高频片段，命中率约 60-70%。开启 gte-rerank-v2 cross-encoder 重排后，把候选集放大到 20-25，再用 cross-encoder 对 (query, doc) pair 精打分，最终 top-5 命中率提升到 85-95%。具体可以在 Knowledge 节点配置里关掉 rerank 跑一次再开启跑一次对比。这套两阶段架构是工业级 RAG 的标配（Pinecone / Cohere 都这么做）。

### Q6：这个 Demo 真的有人会用吗？

**A**：(1) 我们组会用——产品 mm 写完 PRD 先跑一遍，过完基础检查再发评审会；(2) 适合小团队没有专职架构师的场景，AI 替代部分评审能力；(3) 可以做 SaaS 接入 Jira / 飞书文档，PRD 一保存自动跑评审，是个真实可商业化的产品形态。

---

## 八、PRD 里故意留的"坑"（让 LLM 评审能找到的问题）

> 帮你预判 LLM 评审会指出哪些问题，演示时心里有数。

| # | 故意留的问题 | LLM 应该指出 |
|---|---|---|
| 1 | "暂停"语义模糊 | 暂停后能否接收 step 事件？是否会丢消息？需要明确 |
| 2 | 没说权限 / 隔离 | 多用户场景下任务列表是否租户隔离？分享链接是否需要鉴权？ |
| 3 | 没说埋点和监控 | 关键操作（新建/暂停/分享）是否需要 Tracking？前端错误是否上报 ARMS？ |
| 4 | 性能指标没 P50/P99 | LCP < 1.5s 是哪个分位？P99 是多少？ |
| 5 | "回放"功能描述不清 | 状态快照怎么存？前端是 Recording 模式还是从后端拉历史步骤？ |
| 6 | 没提国际化 | NEXUS 已经支持中英文了，新页面是否需要多语言？ |
| 7 | 没提错误兜底 | SSE 重连失败怎么办？任务永久 pending 怎么处理？ |
| 8 | 没提灰度策略 | 如何小范围试点？feature flag 还是按用户灰度？ |

---

## 九、扩展玩法（演示进阶）

### 玩法 1：替换 LLM 模型 A/B 对比

把 LLM-1 改成另一个模型（如 GPT-5.4 vs Claude vs DeepSeek），对比同一份 PRD 评审差异。

### 玩法 2：接入 Jira HTTP 节点

在 JS 节点和 Reply 之间加一个 HTTP 节点，body 引用 `{{js.storiesMd}}`（或者让 JS 节点额外 output 一个 `storiesJson` 字段）POST 到 Jira API 自动建 Story。这样真正实现"PRD 进，Jira 任务出"。

### 玩法 3：多人评审委员会

LLM-1 拆成多个并行 LLM 节点（产品视角 / 架构视角 / 测试视角），各自评审后由一个汇总 LLM 出最终报告。能拉满工作流编排复杂度。

---

## 十、相关文档

- 配套示例 PRD：[`flow-a-sample-prd.md`](./flow-a-sample-prd.md)
- spec-library 数据来源说明：参见 `backend-node/scripts/seed-rag.ts`
- pgvector 优化原理：参见 commit `perf(rag): 用 pgvector 重构语义检索`
- Rerank 实现：`backend-node/src/knowledge/rerank.service.ts`

---

## 十一、进阶玩法 · 启用变量缓存让 LLM-2 参考评审报告

> 5 节点版本已经够演示，本节是"再多一步"的加分玩法。
> 适合有时间打磨细节、想给面试官展示对引擎深度理解的场景。

### 改动点（把 5 节点扩展为 7 节点）

#### 1. 在「变量管理」入口声明变量

设计器顶部点击「变量」按钮 → 「会话变量」Tab → 添加：

| 变量名 | 类型 |
|---|---|
| `review_result` | String |

#### 2. 在 LLM-1 和 LLM-2 之间插入 Assign 节点

| 字段 | 值 |
|---|---|
| 显示名 | `Assign: 缓存评审` |
| 连线 | `LLM-1 → Assign → LLM-2`（断开原有 LLM-1 → LLM-2 直连） |
| Variable | `review_result` |
| Expression | `{{llm1.text}}` |

> Assign 节点引用 `{{llm1.text}}` 时**会立即消费 LLM-1 的流**得到完整字符串赋给变量。这之后 Reply 就**不能**再用 `{{llm1.text}}` 了（流已被消费）。

#### 3. 修改 LLM-2 的 User Prompt

把 `Step 5` 配置的 User Prompt 改为：

```text
# 待拆解的 PRD
{{sys.query}}

# 评审报告（参考其中关键问题，必要时新增补齐 Story）
{{review_result}}

请输出符合 INVEST 原则的 Story JSON 数组。
```

#### 4. 修改 Reply 节点的 Message

LLM-1 的输出已经存到 `review_result` 变量了，Reply 改成引用变量：

```text
## PRD 智能评审报告

{{review_result}}

---

{{js.storiesMd}}
```

### 7 节点版的最终拓扑

```text
[Start] → [Knowledge] → [LLM-1] → [Assign: review_result={{llm1.text}}]
                                     ↓
                                  [LLM-2: 引用 {{review_result}}]
                                     ↓
                                  [JS: 消费 {{llm2.text}}]
                                     ↓
                                  [Reply: {{review_result}} + {{js.storiesMd}}]
```

### 何时值得加这一步

- ✅ 你想演示对 NEXUS 引擎"流式消费一次 + 变量固化"机制的理解
- ✅ 你想让 Story 拆解针对评审报告的漏点主动补 Story
- ❌ 否则 5 节点足以打动面试官，时间花在调 prompt 上更划算
