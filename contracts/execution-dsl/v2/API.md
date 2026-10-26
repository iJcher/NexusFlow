# NexusFlow M3 执行协议 2.0

本文件描述当前可运行子集。规范输入为 `execution.schema.json`，事件为 `event.schema.json`；服务端发布校验还执行 `runtime-python/nexus/spec.py` 的引用、State 和数据 Schema 规则。尚未实现的控制块不进入有效 DSL。

## 浏览器 → Java

基址 `/api/v2`。JSON 请求体上限 262144 字节，包含 chunked；默认禁止跨 Origin 写入。开发 Cookie `nf_session` 使用 HttpOnly、SameSite=Strict、8 小时有效期。只在 loopback HTTP 开发环境使用；生产 HTTPS、Secure Cookie 和部署认证仍待交付。

| 方法 / 路径 | 请求 | 成功响应 |
| --- | --- | --- |
| POST `/auth/email/code` | `{email}` | 200 `{challengeId,retryAfterSeconds,expiresInSeconds}`；不返回验证码 |
| POST `/auth/email/login` | `{email,challengeId,code}` | 200 `{authenticated:true}` + Cookie；验证码一次有效 |
| POST `/auth/login` | `{username,password}` | 仅 NF_TEST_MODE 下的隔离验收/开发账号；正常 UI 无此入口 |
| GET `/workspaces` | Cookie | 本账号实际成员空间，含 purpose；默认 home workspace |
| GET `/auth/session` | Cookie | 200 `{accountId,workspaceId,role}` |
| POST `/auth/logout` | Cookie，包含 viewer | 200，删除服务端 session 与 Cookie |
| GET `/health` | 公开，仅健康信息 | 200 `{status,application}` |
| GET `/capabilities` | Cookie | 当前节点、禁用节点、模型可用性、只读工具、bundleDigest |
| GET `/definitions` | Cookie | 当前 Workspace 的草稿数组 |
| POST `/definitions` | `{name,kind,spec,editor}` | 201 草稿，`revision=1` |
| PUT `/definitions/{id}/draft` | `{name,revision,spec,editor}` | 200 草稿，新 revision；CAS 失败 409 |
| POST `/definitions/{id}/validate` | 无 body | 200 编译 manifest；不代表已发布或具备全部调用权限 |
| POST `/definitions/{id}/publish` | 无 body | 200 不可变版本 `{id,definitionId,ordinal,hash,spec,manifest,...}` |
| POST `/definitions/{id}/preview` | 无 body | 不可变 PREVIEW 版本；试运行草稿不隐式发布 |
| GET `/versions` | Cookie | 当前 Workspace 的 PUBLISHED 版本；不混入 PREVIEW |
| POST `/runs` | `{versionId,input}` + `Idempotency-Key` | 202 `{runId,commandId,status}`，仅表示 Java 已持久接收 |
| GET `/commands/{id}` | Cookie | `{commandId,status,attempts,errorCode,path}` |
| GET `/runs/{id}` | Cookie | Run 投影，或 `{status:QUEUED/REJECTED,...}` |
| GET `/runs/{id}/events?after=N` | Cookie | SSE，严格按该 Run 的递增 seq 回放 |
| POST `/runs/{id}/approvals` | `{checkpointRef,interactionRef,decisions:[{interruptId,approved,comment}]}` + Idempotency-Key | 202 审批审计与根 RESUME Outbox；不是执行完成 |
| POST `/runs/{id}/cancel` | 无 body + Idempotency-Key | 202 根 CANCEL；不能撤回已发生的操作 |

草稿 `editor.positions` 只保存布局；执行 hash 不包含布局、名称或 revision。同 spec、相同执行 bundle 的重复发布复用版本。Run 固定发布版本；更新草稿或发布新版不会改变旧 Run。`kind` 只能为 `workflow` 或 `agent`。

账号与 Workspace 由 session 和真实 membership 确定。可通过 `X-Workspace-ID` 选择本人所在 Workspace；body 中身份字段、`X-User-ID` 不影响身份。owner/editor 可写，viewer 可读及退出。资源越界返回 404，非法 Workspace 选择返回 403。连接 use 权限在发布（含依赖）与每次 START 检查，尚不承诺在途撤权。

`Idempotency-Key` 为 1–128 个英文字母、数字、`_`、`-`。同 Workspace、同 key、相同版本与输入复用原 Run/Command；不同 payload 返回 409。Java Run/Outbox/Audit 同事务提交。Python 拒绝后 command=`REJECTED`，Run 查询给出明确错误，不将 202 当作成功执行。

错误响应为 `{code,path?}`；代表性状态为 401 认证缺失、403 权限/Origin、404 资源不存在、409 revision/幂等冲突、413 大小超限、422 DSL/Schema、429 容量限制、502/503 上游暂不可用。不得将模型凭据、上游原始错误或内部堆栈放入错误响应。

## Java → Python

开发地址 `127.0.0.1:19082`，必须服务端 Bearer credential，浏览器无此 credential。运行查询额外携带可信 `X-NF-Workspace`。仅 `/health` 公开。`/diagnostics` 仅本机测试模式启用且仍需服务认证。

| 方法 / 路径 | 当前协议 |
| --- | --- |
| POST `/validate` | body 为完整 DSL，或服务端可信的 `{spec,bundleDigest}` 以验证归档编译器；返回 `{hash,bundleDigest,compilerVersion,dslVersion,nodeIds,nodeAdapterVersion,reducerVersion}` |
| GET `/capabilities` | `nodes[{type,enabled}]`、disabledNodes、`models[{id,mode,available?}]`、`tools[{name,readOnly}]` 等；前端根据实际能力限制操作 |
| POST `/commands` | `{kind:"START",runId,commandId,workspaceId,versionId,spec,manifest,dependencies,input,authorizedConnections}`；202 仅表示 inbox 持久化 |
| GET `/runs/{uuid}` | `{runId,versionId,status,output,errorCode,highWaterSeq,checkpointRef,usage,invocations}` |
| GET `/runs/{uuid}/events?after=N` | SSE，与 Java 对外事件一致 |

dependencies 是 `{publishedVersionId:{definitionId,spec,manifest}}`，递归覆盖所有 Workflow/Agent 发布引用，并包含根版本描述。所有引用必须是同 Workspace 可用的 PUBLISHED 版本，PREVIEW 不能成为工具；Java 对整个闭包检查模型 use 权限、定义身份递归、最多四层及最多 64 个依赖。根版本可为 PREVIEW。Python 重新计算 manifest、校验版本/输入/连接许可后持久化 inbox。commandId 与 canonical payload 一一绑定，重复同 payload 安全复用。M2 开放 START、RESUME、CANCEL；SIGNAL 未开放。RESUME 额外携带 expected checkpointRef、interactionRef 和按 interrupt ID 索引的 resumes 决定。仅根级命令，不能以根命令账本冒充节点调度器。

`bundleDigest` 覆盖执行语义文件 spec.py、graphs.py、composition.py、Python lock 与 DSL schema（归档 M2 继续使用其原有摘要口径）；manifest 记录 Compiler、Adapter、Reducer 版本。可信本地归档保存完整运行包及逐文件 SHA、依赖版本，并按固定 bundle 加载旧执行语义。归档缺失、校验失败或依赖版本不兼容时明确拒绝；不下载或运行用户提供的代码。归档目录需要随 checkpoint 数据一同保留；当前本机方案不提供跨主机 HA 或任意依赖共存环境。

RESUME 必须同时匹配根 checkpointRef 和 interactionRef。原生嵌套并行部分恢复可能仅改变 pending interrupts，根 checkpoint ID 不变；interactionRef 固定根 checkpoint 与当前 interrupt ID 集合，不能只依赖 checkpoint ID。Java 按 run/interrupt 固定决定，重复相同决定复用原 command，不允许改判或旧新批次隐式合并。Python 同 thread 只运行一个根命令；APPLYING 命令重启后必须从原生快照确认请求 ID 已被消费，无法证明时 NEEDS_ATTENTION，不重复应用 Command(resume)。

## 执行、事件与 State

Outbox 中 RESUME/CANCEL 必须等待对应 START 投递成功后才能发送，即使 START 正处于重试退避。若 START 已明确 REJECTED，后续取消在 Java 本地记为 RESOLVED / NO_EXECUTION_TO_CANCEL，不向 Python 创建不存在的执行，根 Run 仍为 REJECTED；该状态不表示 Python 已接收 CANCEL。

一次根 Run 使用一个原生 thread_id=runId。固定 workflow node ID、根 Run 与绑定版本组成 Invocation 身份；Agent 模型决策使用 Invocation + 持久 decision ordinal，工具调用以该决策和 tool ordinal 生成独立 ID。attemptId 表示本次进程执行尝试，可以改变；业务 Invocation 与工具收据不能随恢复改变。

Sequence 每一步的输入映射可以读取根 input、已声明共享 State、前驱结果或 literal。`write` 显式提交共享 State，`output` source 读取本节点结果。Agent 消息为局部 native State；跨单元交换通过 input/output Schema 与显式映射。共享 State 上限 262144 字节，`last_value` 使用 native 单写者通道；`collect_by_id_v1` 相同 key 相同值可重放，不同值显式 STATE_CONFLICT。Parallel 中不同普通字段可独立写，同一普通字段多分支写入在发布时拒绝。结果集合相同 key 的不同 JSON 值明确失败，不静默覆盖。集合不支持用空对象伪装清空；新 Run 从独立 State 开始。

SSE frame 使用 `id: seq`、`event: execution`、`data: JSON`，含 keepalive 注释。重连使用 `?after=最后处理的seq`，当前不读取 Last-Event-ID header。消费方按 eventId/seq 去重，Run 查询与持久记录补齐断线状态。客户端断开只结束流，不取消 Run。

Progress 表示观察结果，不能当成 checkpoint 提交证明。`checkpoint.committed` 对应真实 native checkpoint，terminal COMMITTED 对应运行账本的确定结论；失败也可有 COMMITTED terminal，并不表示整个图成功。收据是工具结果的依据，不能从事件反推外部副作用。工具当前均只读；外部写入不在本协议范围。没有收据的只读操作可安全重试，每次实际尝试继续计入工具预算；已确认收据复用不再预留。M3 的原生子执行工具以稳定调用意图预留一次，等待及重复恢复不会重复扣同一工具意图；子执行内的模型和工具仍累加到根及所有祖先的额度。工具重试由原生 RetryPolicy 执行，仅瞬时只读错误可重试，最多三次；预算、取消、权限等错误不能以 continue 吞掉。


## 控制块、等待与前端

Sequence 按顺序执行。Branch 按声明次序命中第一条，否则进入 default；eq/ne 使用规范 JSON 值比较（布尔不等于数字），数字比较要求数字，contains 只接受文本/文本、列表/JSON 值或对象/文本 key。Parallel 原生 fan-out 后 ALL Join，分支内可包含结构化控制块；节点 ID 全图唯一、可见结果只能来自前驱/祖先作用域。

一个分支 Human 中断时，同一次原生调用中其他可执行分支会推进到其原生边界；stream 返回并核实持久 interrupt 后根 Run 才进入 WAITING 并释放执行槽。当前正式子图封装下已验证未中断的多步兄弟分支可以完成，根 Join 等待全部分支。WAITING 不是承诺所有分支独立持久存活，也不会用节点调度器补造这种语义。

Run 查询包含 interrupts、checkpointRef、interactionRef、cancelRequested。Human 输出包括 approved、comment、可信 decisionId。拒绝审批本身返回 approved=false，之后如何分支由 Workflow 明确配置；UI 用“拒绝并继续”避免冒充自动终止。人工决定由 Java 权限、审计与 Outbox 权威记录，LangGraph interrupt/进度由 Checkpointer 权威记录。

等待不占用持续 Java 工作线程或 Python 执行槽。SSE 使用异步 HttpClient Publisher → SseEmitter，32 路有界转发，完整 frame 后解码 UTF-8，断开释放订阅。取消是协作式，模型 I/O 有单次超时，不承诺瞬时撤回远端请求；根 deadline 包含等待时间，当前最大 600 秒，是本机验证限制。

编辑器为结构块生成合法路径，不提供任意跨块连线。拖动只修改 editor.positions；前移/后移、删除、撤销和字段选择修改草稿，执行版本仍固定。普通使用通过字段表单、资源弹窗、共享数据配置和预览调试完成，不要求用户编写本协议 JSON。M3 已开放四向组合；Map、Loop、SIGNAL、外部写工具仍关闭。


## M3 发布调用契约

Workflow 节点 `agent_call` / `workflow_call` 使用固定 `versionRef` 和显式 `input` 映射；返回结构化结果后才执行父节点的 `write`。子图使用私有输入、结果和共享数据通道，不继承可写的父 State。

Agent 使用 `agent.executionTools: [{name,description,versionRef}]` 声明最多 8 个已发布执行工具，工具参数 Schema 来自被绑定版本，不由模型自行定义。`name` 在 Agent 内唯一且不使用系统内置工具名。Agent 仍由原生 `create_agent` 决策和执行工具；调用不会另起根命令或持久工作线程。普通编辑器使用资源选择弹窗和自然语言用途描述，不要求填写工具协议。

Invocation 身份为根 UUID / 结构节点路径，或 Agent Invocation / tool / 持久模型决策与工具序号摘要。同一 Workflow 的不同调用拥有独立身份；恢复复用成功子结果及读工具收据。业务树使用显式 parent_id、version_id、输入、输出，不从原生 checkpoint namespace 反推业务身份。递归按 Java 权威 definitionId 拒绝，包括同一资源的不同发布版本。取消、失败、根及祖先预算/deadline 传播；子执行在人工等待时自身的 timeout 也会由根生命周期巡检终止调用链，不等待用户恢复才发现超时。

同一新 Run 的整个依赖闭包使用同一执行 bundle。引用归档 M2 Agent 的已有 Workflow 草稿仍可以由原归档 Compiler 编译、预览并恢复；新增 M3 调用需要把相关资源显式按当前版本重新发布并选择，不自动改发布版本或旧 checkpoint。混合 bundle 明确拒绝。

验证连接向兼容供应商请求 JSON object 输出，再执行本地完整 JSON/Schema 校验；不补齐截断回答、不把部分 JSON 投影当成最终结果、不为了通过验收自动重试。Token 预留在本机验证策略下不限且继续计量，模型/工具次数、最多四层及超时限制保留。连接授权仍在发布和每次 START 的递归闭包检查；在途撤权尚未交付。

## 根 Agent 连续对话（conversationRuntimeVersion=1）

`POST /api/v2/runs` 默认仍创建独立 Run。根 Agent 可附加 `conversation:true`：首次服务端生成 Thread（标识等于首轮 Run ID），后续附加 `conversationId` 续接。同一 Thread 每轮仍有不同 Run ID；Workflow/子 Agent 不自动加入会话。

归属为 Workspace + 发起 User + 固定发布 Version。前一轮未成功完成时拒绝新轮次；版本变化返回 `CONVERSATION_VERSION_CHANGED`，无权限的续接返回 `CONVERSATION_NOT_FOUND`。连续模式要求 manifest 的 `conversationRuntimeVersion` 为 `1`；旧 bundle 的独立运行接口继续可用。`GET /runs/{id}` 对有权用户返回 conversationId；`GET /runs/{id}/conversation` 返回当前轮之前的历史 Run 输入/结果。历史 Run 结果不可变，不使用最新 Thread State 覆盖历史结果。

消息、受保护用户原文与顺序、摘要由现有原生 Checkpointer 管理。Java 仅在 run_request 存 conversation_id 和 previous_run_id，不增加消息表。对话读取、SSE、命令与控制均核验发起用户，不能因共享 Workspace 自动共享 Thread。

`agent.contextPolicy` 可选，包含 `triggerTokens`、`maxInputTokens`、`keepMessages`，随发布定义固定。默认分别为 24000、100000、4，计数为保守估算而非供应商 Token 计费。trigger 必须小于 maxInput。原文约束与必要上下文超出输入保护上限时返回 `CONTEXT_WINDOW_EXCEEDED`，不静默丢弃；累计 Token 预留仍遵循现有 unlimited 政策。

`context.compacting` / `context.compacted` / `context.window` 为公开进度事件，摘要内部模型调用在 `agent.model.*` 中标记 `phase=summary` 并正常计量，摘要正文和私有 AgentState 不进入 SSE。原工具结果可通过原生 BaseTool `recall_context_result` 在当前 Thread 内按受控引用读取，MCP 原结果仍复检连接授权。

## 用户确认的长期记忆（memoryRuntimeVersion=1）

更新：当前 `native-auto-memory-9` 另带 `automaticMemoryVersion=1`。默认产品行为改为每轮成功回答后由 Agent 自动提取稳定偏好、习惯和持续项目约束；原确认 API 保留为显式覆盖能力，普通管理弹窗不再要求填写/确认。来源增加 `user_observed`，`confirmed=false`，携带精确用户原文及 Run 来源。自动更正/忘记与原生 Store 修改在既有 operation_receipt 事务中提交，按 Run 固定操作身份去重。客户端不能指定 memoryScope。

`agent.model.*` 的 `phase=memory` 表示内部提取过程，正文不作为回答流；`memory.updated` 仅返回写入/删除数量，异常记录 `memory.skipped`，不把不确定内容作为成功记忆。预算不足时跳过辅助提取，取消/超时仍遵循根控制。旧 bundle 按旧语义恢复。

- `GET /api/v2/definitions/{id}/memories` 返回 `{items:[{id,content,source,confirmed,provenance}]}`。只查当前 Workspace、User、逻辑 Agent Definition 的命名空间，不接受客户端 userId/namespace。
- `POST /definitions/{id}/memories` 接收 `{content,confirmed:true,source:"user_explicit"}`；普通页面从本轮用户输入提取候选，由用户确认后存入原生 PostgreSQL Store。内容规范化后按来源+内容去重，相同请求返回 `item.reused=true`，不重复创建。
- API 可附加 `source:"tool_observation",sourceRunId,invocationId`。来源 Run 必须属于当前用户和同一 Agent，成功 Invocation 的节点名限定内置只读 `inspect_text/word_count`，候选必须来自已保存返回值的真实原文片段。保留来源引用，不能传入 `model_guess`。MCP/网页工具的事实提取和工具片段选择 UI 尚未开放。
- `DELETE /definitions/{id}/memories/{key}` 幂等删除当前用户/Agent 命名空间的条目，不影响其他用户或 Agent；不回溯擦除历史 Checkpoint、Run 输出及已接受 START 快照。

每个命名空间最多 20 条，每条 1000 字。没有向量检索；原生 Store 查询有界已确认集合。新 bundle 的根 Agent 连续 START 在 Java 权限上下文下读取集合，固定为 Outbox 的 `memoryContext`；恢复复用原 START，`create_agent` 使用原生 Store，模型调用前以 Human 级背景注入。当前用户更正优先，工具结果仅视为历史观察，不能授予权限或证明操作已经完成。独立 Run、Workflow、子 Agent 和旧归档 bundle 不隐式获得记忆。

`memory.loaded` 为公开进度事件，仅包含条目数量；记忆内容不作为 SSE 技术事件载荷广播。常见凭据格式拒绝、容量/长度拒绝和来源失败为 `MEMORY_SECRET_DENIED/MEMORY_CAPACITY/MEMORY_CONTENT_INVALID/MEMORY_SOURCE_INVALID`。缺少确认返回 `MEMORY_CONFIRMATION_REQUIRED`。累计 Token 预留政策保持 unlimited。
