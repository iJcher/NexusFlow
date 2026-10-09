# NexusFlow 企业化升级实施与验收计划

日期：2026-10-06（计划基线）。状态：持续实施中；当前工作区为 implementation/，阶段结论以冻结源码的实际验收报告为准。

本计划对应用户要求：补齐复杂业务编排能力；先给方案，再按阶段编码；每阶段调用独立 subagent 生成自动化测试，实际执行后判断验收；登录升级为真实邮件验证码登录。

## 1. 代码基线与交付目标

### 1.1 已核实基线

- 实际源码：`D:\NexusFlow\NexusFlow`，本次读取为 `main`，HEAD `a4e9629`，工作树干净。
- 当前可写工作区 `D:\Code\NexusFlow` 原本为空。本文件保存在这里；下文代码相对路径均相对于实际源码根目录。
- 开工前将会话工作区切换/绑定到实际仓库，或获得实际仓库写权限；不要在空目录重建一份不完整项目。
- 现有声明技术栈：NestJS 11、Prisma 6、PostgreSQL/pgvector、Vue 3、Vue Flow。声明范围不等于安装版本；开工核实 lockfile、运行时与兼容性，新增依赖固定版本。
- 保留已有设计器、流程、用户及资源归属。不因本计划推送、部署或修改云资源。

| 已查证现状 | 源码依据 | 改造要求 |
| --- | --- | --- |
| 登录页已有手机号必填/格式、密码长度校验 | `front/src/views/login/index.vue` | 不是完全没有校验；缺邮箱验证码全链路和可信后端验证 |
| 已有用户登录没有比较密码，新用户使用加盐 MD5 | `backend-node/src/auth/auth.service.ts` | 优先关闭不安全旧登录旁路 |
| 用户详情返回完整实体风险，refresh 缺可信刷新凭证链路 | 同上及 `auth.controller.ts` | 返回字段白名单、会话轮换与撤销 |
| 已有 SSE 输出，但执行拿着 Response，结果主要存在本次请求 Map | `backend-node/src/workflow/flow-runtime.service.ts`、`flow-ai.controller.ts` | 缺的不是 SSE 协议，而是执行解耦、持久事件和恢复 |
| 并行节点共享 `runtime.currentNode` | 同上 | 独立节点上下文，消除并行覆盖 |
| MCP 服务主要保存配置 | `backend-node/src/mcp/mcp.service.ts` | 配置 CRUD 不等于真实工具发现/调用 |
| Embedding 失败存在本地 256 维向量回退 | `backend-node/src/knowledge/embedding.service.ts` | 禁止混用向量空间并伪装为正常语义检索 |
| Redis 为 allkeys-lru | `docker-compose.yml` | 队列关键数据不能按缓存策略淘汰 |
| 后端声明 Jest/Supertest，前端无测试 runner，部署主要做构建 | 两端 `package.json`、`.github/workflows/deploy.yml` | 建立真正验收入口，build 不等于行为正确 |

### 1.2 产品定位与复杂业务闭环

定位：可持久化、可治理的 AI 业务编排平台。工作流管版本、权限、状态、审批和外部副作用；Agent 作为受约束节点处理开放任务，不是二选一。

第一条必须完成的场景：PRD 研发准入与任务落地。

```text
API/Webhook 提交 PRD → 输入/附件校验
  → 并行：业务完整性评审、技术风险评审、组织规范检索
  → Join 聚合 → 结构化问题与任务草案
  → 条件分支：不满足准入则生成整改清单并结束
                满足准入则进入人工审批
  → 审批人修改/批准/拒绝（可跨进程、跨天）
  → 批准后有界批量创建 Jira 任务 → 回写映射与通知
  → 版本、运行、审批、外部操作可审计
```

价值来自并行/条件汇合、人机协同、恢复与外部写入治理。RAG 是规范查询节点，不是产品全部。

非目标：任意图循环、无限 Agent、跨地域高可用、分布式 exactly-once、通用自动回滚、现成合规认证。不用“企业级”替代工程证据。

## 2. 架构与数据契约

### 2.1 执行与观察分离

```text
浏览器/API/触发器 → RunService → PostgreSQL（Run/Node/Event/Outbox）
                                      ↓ OutboxDispatcher
                                Redis + BullMQ
                                      ↓ NodeWorker/恢复调度
                              PostgreSQL 状态/输出/下一批 Outbox

浏览器 → SSE Controller → PostgreSQL 事件回放/增量查询
                            ↑ Redis 只用于唤醒，不是唯一事件来源
```

保留 NestJS 模块化应用，拆 API、Worker、代码隔离执行器进程/容器，不盲拆微服务。PostgreSQL 为业务事实来源，Redis 为调度/限流设施。

模块建议：RunService、WorkflowCompiler、DagScheduler、NodeRegistry、NodeWorker、RunRepository、RunEventStore、OutboxDispatcher、RecoveryService、SseController、ApprovalService、ConnectionService。FlowRuntimeService 逐步转兼容层，避免两套执行真相。

### 2.2 节点如何传数据

每节点声明 input/output JSON Schema，配置保存类型化绑定。运行时读取前驱持久化结果，不读取共享 currentNode，不把字符串模板当任意表达式。

```json
{
  "nodeId": "aggregate-review",
  "inputBindings": {
    "businessIssues": {"source": "node", "nodeId": "business-review", "path": "/issues"},
    "technicalIssues": {"source": "node", "nodeId": "technical-review", "path": "/issues"},
    "prd": {"source": "runInput", "path": "/prd"}
  }
}
```

发布校验引用、可达性、类型与禁止环；运行校验真实输入/输出。必填缺失报错，不静默填空。可空、默认值、数组合并显式声明。附件传受控对象引用，不塞进事件；敏感字段按权限隐藏。旧 `{{nodeId.path}}` 做受限迁移，有歧义报告人工处理。

Run 固定版本与输入快照；执行使用独立 `{runId,nodeId,attemptId,resolvedInputs,version}` 上下文。并行分别保存输出，Join 按绑定聚合；同名变量需要独占或显式合并策略。

### 2.3 数据模型与状态

分阶段新增：EmailChallenge/AuthSession、Workspace/Member、WorkflowVersion、FlowRun、NodeRun/NodeAttempt、RunEvent、Outbox、ApprovalTask、ExternalOperation、Connection、Trigger、AuditLog、UsageReservation。

- Version 发布后不可变，包含 schemaVersion、图、hash、发布人；草稿仍可编辑。
- Run 保存 workspace、owner、versionId、输入快照、状态、取消意图、事件 high-water mark；草稿不影响运行。
- NodeRun 与 Attempt 分开，保存逻辑状态、每次尝试、输入输出、租约、fencing token、错误类别与 usage；重试不覆盖历史。
- Event 的 `(runId,seq)` 唯一，通过 per-run 行锁等方式串行分配并保持提交顺序，允许空洞但不倒退/重复；payload 带 schemaVersion、nodeId、attemptId。不能仅用独立自增序列，否则 seq=101 先提交并送出、100 后提交，会被 after=101 永久跳过。highWaterSeq 与快照从同一一致性读取得。
- 状态与 Outbox 同事务写入，dispatcher 至少一次投递；CAS/唯一约束防重复生效，不只依赖 queue jobId。
- ExternalOperation 保存稳定逻辑 key、目标、请求摘要、外部 id/状态；批处理 key 包含 runId/nodeId/稳定 itemId 或 iteration identity/动作类型，不能所有项共用一个 key，也不随 attempt 改变。itemId 在固定输入/审批版本中唯一，重试和恢复保留它。

节点状态：pending/ready/running/retry_wait/waiting_approval/succeeded/failed/skipped/cancelled/unknown。Run：queued/running/waiting_approval/succeeded/failed/cancelling/cancelled/needs_attention。终态不能被迟到 Worker 改回 running。

边为 unresolved/active/inactive；条件未选边解析 inactive。Join 等相关前驱全部解析，再检查激活依赖；不能把未运行当完成。首版 AND Join，没有激活输入时跳过并传播；任意环拒绝，后续只支持受限 ForEach。

### 2.4 重试、未知结果与取消

临时网络/可恢复 provider 错误有限重试；参数/权限/结构错误不盲重试。租约过期恢复检查，完成输出复用，fencing/CAS 拒绝旧 Worker 写入。

外部已接受操作但本地无结果：支持目标幂等/可核验标记时对账；否则 unknown/needs_attention，禁止直接重复写。人工确认成功或确认未执行后重试必须授权并审计。不承诺分布式 exactly-once。

取消是持久意图：停止新节点、尽力中断可取消调用，已完成外部动作不声称撤销。补偿显式定义/授权，不自动删除用户任务。事务提交、queue 投递、provider 请求边界都做故障注入。

## 3. 所有阶段的自动化验收协议

### 3.1 工具与隔离环境

P00 建立：后端 Jest/Supertest、前端 Vitest/Vue Test Utils、端到端 Playwright。先核实当前 Jest/ts-jest 等兼容性，不忽略类型错误。测试 Compose 提供独立 PostgreSQL/pgvector、Redis、Mailpit 和确定性 LLM/HTTP/MCP 服务，不连接生产。

进程终止/故障代理测试真实 DB 边界；生产不包含测试后门。测试用独立 compose project、随机资源前缀与受控清理，不碰生产数据。

建议代码路径（真实仓库）：

- `scripts/verify-stage.ts`：跨平台验收入口；根目录仅增最小编排配置，不顺手重构为新 monorepo。
- `tests/acceptance/P00..P09/`：独立脚本/fixtures/案例清单。
- `backend-node/test/`、`front/src/**/*.spec.ts`、`tests/e2e/`、`playwright.config.ts`。
- `docker-compose.test.yml`、`.env.test.example`：无真实密钥。
- `artifacts/acceptance/<stage>/<run-id>/`：忽略提交的 JUnit/JSON、trace、截图与脱敏日志。

规划命令 `pnpm verify:stage -- P00`、`pnpm verify:all`，目前尚不存在，由 P00 实现。

验收运行：锁定安装→迁移→单测→真实 DB API 集成→浏览器 E2E→故障场景→构建/类型检查/只读 lint→汇总。后端现有 lint 带 --fix，新增 lint:check，验收不修改源码。

### 3.2 每阶段必须调用独立 subagent

1. 主 agent 冻结阶段 contract、迁移、验收案例与安全边界，记录基线，实施阶段能力。
2. 调用测试 subagent 独立生成脚本，允许写测试/fixtures/测试配置，禁止改业务实现；不能把当前实际行为当期望。
3. 覆盖正确/错误输入、权限、边界、并发与故障；至少一个负对照证明关键行为被故意破坏时测试会红。
4. 主 agent 检查真实 API/浏览器/DB 断言，实际运行并保存命令、退出码与报告，不接受仅有 mock 调用次数的覆盖。
5. 失败修实现；测试错误须有依据。不降断言、不吞异常、不改 skip、不反复重跑掩盖首次失败；需求变化显式改计划。
6. 重跑阶段、受影响历史回归与构建/类型检查；必要时再请 subagent 审核报告。
7. 写验收记录、更新进度。依赖 gate 未 PASS 不越过；可推进不依赖失败项的准备工作。外部部署/资源写入仍需相应授权。

subagent 任务模板：

```text
按计划 Pxx 和冻结 contract 生成独立自动化验收脚本。
允许：该阶段 tests/acceptance、对应单测及明确授权测试配置。
禁止：修改业务代码、降低断言、真实用户数据/密钥泄露。
交付：案例ID→脚本→断言→证据映射、命令、负对照、外部前提和缺口。
主 agent 实际运行并决定 gate，不自行宣称产品完成。
```

本计划编写已调用 stage_test_plan subagent 审查契约/测试设计，不代替后续逐阶段生成和执行脚本。

### 3.3 判定与证据

| 状态 | 条件 | 动作 |
| --- | --- | --- |
| PASS | 必选全通过、必选 skip 为零、构建/类型检查通过、含要求的真实集成证据 | 可进入依赖阶段 |
| PARTIAL | 本地必选通过，但真实邮箱/Jira 等必需项尚未验证 | 不宣称完成，只推进不依赖项 |
| BLOCKED | 缺权限/凭证/设施导致必选不能运行 | 写缺项与解除条件，不当成通过 |
| FAIL | 断言/构建失败、安全缺陷或数据不一致 | 修复并重跑，不跨依赖 gate |

自动汇总优先级：任何必选已执行失败→FAIL；无失败但缺必选运行前提→BLOCKED；无阻断但尚有待执行/待完成必选项→PARTIAL；全部必选完成且通过→PASS。缺真实 SMTP 凭证时 overallStatus=BLOCKED，可另写 localStatus=PASS、完成范围=PARTIAL，不能让脚本随机选择状态。

报告含 git revision/dirty diff hash、环境与依赖版本、冻结契约、案例ID、开始/结束时间、命令/退出码、pass/fail/skip、所有重跑记录、证据路径、缺口。OTP/token/secret/敏感全文不入报告。

浏览器 trace/HAR/视频也可能记录填码参数、Authorization/cookie，不能以“测试凭证”忽略泄漏。认证敏感步骤禁用原始 trace/录屏，安全截图隐藏输入；其他 trace 保存前去掉敏感 header/cookie/请求字段，无法可靠脱敏则不保存该产物。报告保存前自动扫描已知测试 OTP/token/secret，敏感数据命中即 FAIL。

覆盖率辅助查漏，不编百分比充质量保证。性能先测固定机器/数据基线，再锁预算；不声称未经测量的 QPS/延迟/恢复时间。

## 4. 分阶段实施计划

下列均为必选验收；每阶段都执行第 3 节 subagent→运行→修复→回归→gate。

### P00：邮箱验证码登录、旧鉴权修复与测试基座

目标：输入邮箱→真正收到邮件→输入验证码→登录；安全与失败路径可验证。

改造入口：`backend-node/src/auth/`、`backend-node/prisma/schema.prisma`、`front/src/views/login/index.vue`、前端 auth service/store/interceptor。新增 EmailCodeService、MailService、AuthSession，并建立第 3 节测试基座。

实施合同：

1. 接口建议：`POST /auth/email/code {email}` 返回 `{challengeId,expiresAt,retryAfter}`；`POST /auth/email/login {email,challengeId,code}` 返回脱敏用户/access token，同时设置 refresh cookie；`POST /auth/refresh`、`POST /auth/logout`。任何响应不含 OTP。
2. 前后端都校验。后端 class-validator 配合实际启用的 ValidationPipe，拒绝多余字段/错误类型/控制字符/header 注入。邮箱 trim、域名小写，本地部分规范化按明确政策处理，不擅自去除 +tag/点或猜别名，避免错误合并账号；合法 + 地址/国际域名政策有测试。
3. 建议初始可配置政策：密码学随机 6 位数字，TTL 10 分钟，发送间隔 60 秒，单 challenge 错误最多 5 次。以上是设计值，不是行业保证；服务器权威时间，邮箱级失败/发送预算不能通过新 challenge 绕过。
4. Challenge 绑定邮箱/用途/随机 ID，DB 存独立 pepper 的 HMAC 摘要，不存明文；含 expiresAt、attempts、consumedAt、sendState。OTP 只短暂留发送内存，日志/追踪/API/事件均不记录。
5. 验证事务/行锁/CAS 保证仅消费一次，消费、用户唯一创建/读取和 session 建立原子完成。错误计数要真正提交，不能抛异常后回滚计数；过期、旧码、已消费、异邮箱/用途、禁用/删除账户拒绝。
6. 邮箱/IP/全局多实例限流，可信代理配置，Retry-After；刷新页面/改邮箱/伪造 X-Forwarded-For 不绕过。Redis 不可用时有界拒绝，不无限放行。响应不暴露注册与否。
7. 并发发送以锁/冷却记录控制。重发成功才使旧 challenge 失效；重发失败不覆盖仍有效旧 challenge。SMTP 拒绝/超时令新 challenge 无效；结果不确定记 delivery_unknown、拒绝新 challenge，冷却后可再发，不无限重发不同有效码。
8. 使用真实 SMTP transport：TLS、发件人、连接/发送超时；生产缺 SMTP/pepper/session 配置 fail-fast，禁止控制台回退/万能验证码。Mailpit 仅隔离开发/测试使用。
9. 首版有界同步发送，不在通用 Outbox 保存明文 OTP；将来异步邮件单独设计加密短期载荷与清理。SMTP 接受后才启用 challenge，TTL 从接受时间计；进程中断的 pending challenge 无效。accepted 不等于收件箱 delivered。
10. 新用户只在验证后创建，email 唯一由 DB 保证。旧 phone/hash/salt 可空兼容迁移，不改 userId/owner，不清库、不按昵称/手机号猜邮箱。旧资源需要独立可信绑定流程；旧漏洞取得的 session 不足以证明归属。
11. 立即禁用不验证密码的公开 RegistOrLogin；用户详情/list 收口权限与字段白名单；关闭旧不可信 refresh。新 JWT 引入明确 issuer/audience/authVersion 与可撤销 session 关联，部署时轮换旧签名密钥并停止接受旧签名/旧 token 格式；仅删除新 AuthSession 不能撤销旧 JWT。已确认暴露的其他密钥走授权轮换。保留旧数据，不保留漏洞旁路。
12. Access token 短期配置；refresh 随机 token 仅存 hash、HttpOnly/Secure/SameSite cookie，轮换/token family 重用检测/退出撤销。按最终同源/跨源拓扑验证 CSRF/Origin。前端尽量不持久化 token，OTP 永不持久化，不放 URL。
13. 页面提供邮箱/验证码、发送/重发、冷却、loading、错误、键盘提交/无障碍标签。无效输入不发请求，重复点击防重入，邮箱变化清 challenge/code，服务端 retryAfter 校准计时，卸载清 timer。只记邮箱，不记 OTP；无功能 OAuth 控件移除或明确禁用。
14. `.env.example` 只写变量名和用途；依赖固定、测试工具兼容、建立只读 lint 与统一验收入口。

阶段末 subagent 必须生成并运行：

| 案例 | 必选行为与证据 |
| --- | --- |
| P00-AUTH-01 | Playwright 填邮箱→后端真实 SMTP 到 Mailpit→测试 API 读邮件→页面填码→受保护页面；DB 已验证用户/session。不能 mock MailService 或设业务读码后门 |
| P00-AUTH-02 | 空值/非法邮箱/错误码格式被前端拦截；直接 API 仍拒绝；合法 + 地址处理正确 |
| P00-AUTH-03 | 错误、过期、已用、旧码、异邮箱/用途、禁用用户均拒绝；可控时钟测截止边界，达到失败次数后正确码也拒绝 |
| P00-AUTH-04 | 并发验证恰好一次成功；并发首次登录一个身份/用户；多实例发送/刷新/伪造代理不绕限流；DB 错误计数可证明 |
| P00-AUTH-05 | SMTP拒绝/超时/断网/进程中断/缺配置，不假成功、不留可用新 challenge，恢复按策略重发 |
| P00-AUTH-06 | refresh 轮换/重放/撤销/过期/CSRF；旧入口、旧签名 JWT/旧格式 token 均不绕过，迁移前后 id/owner/资源一致，刷新页面与会话失效正确 |
| P00-AUTH-07 | 响应/日志/DB 无明文 OTP/secret；故意启用码重用或旧旁路的负对照会红 |
| P00-AUTH-LIVE | 用真实 SMTP 发到授权测试邮箱，确认收件箱实际收到，从该邮件 OTP 完成登录；保留脱敏 Message-ID/发送与收件时间，不保留 OTP |

LIVE 可由受限测试邮箱 API 自动收码；没有收件 API 时人工收码配合自动化登录，标注人工步骤。SMTP verify/accepted 或 Mailpit 通过均不能代替真实收件。

Gate：本地全部通过且 LIVE 实收验证完成；缺真实配置/地址最高 PARTIAL 或 BLOCKED，不宣称真实邮件登录完成。外部准备：SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM 和授权收件地址，密钥经环境配置，不贴聊天。SPF/DKIM/DMARC 配置由授权运维处理，不擅改 DNS。

### P01：安全、Workspace、类型化流程与不可变发布

目标：有权限的人才能编辑/发布/运行；版本与数据契约可信，历史资源可迁移。

实施：

- 新 Workspace/Member：Owner、Editor、Operator、Approver、Viewer 最小权限矩阵覆盖所有资源/API/Run/Event/附件。旧用户迁独立 workspace，可重入，保留 id/owner；无 owner 资源不变公开。
- 邀请需被邀请人验证邮箱并接受，不按客户端参数加入/提权。连接 use 单独授权，秘密不回明文。权限变更即时影响后续请求与写动作，长运行如何停用/重授权有明确政策。
- Connection 加密与脱敏 DTO；生产托管 key、开发 key 分离，缺 key fail-fast；迁移 provider/MCP headers/env secret，记录 hash/迁移状态不输出原文。
- 统一出站策略：协议/端口/批准域名、私网/回环/元数据地址、重定向/DNS rebinding、内容大小/超时；应用校验与网络出口同时限制。文件上传类型/大小/内容约束。
- JS 默认关闭，P02 独立低权限资源受限执行器验收后再启用；node:vm/Worker Thread 不算安全隔离。
- compiler/registry/schema、草稿→发布→停用；旧图迁移报告。草稿可不完整但不可发布；Run 固定版本，停用只阻止新 Run，不改历史。

阶段末测试：P01-01 逐端点角色矩阵/跨租户 IDOR（覆盖本阶段存在的资源；Run/SSE 新端点在 P02/P03 加入同一权限回归）；P01-02 加密/脱敏/缺 key/JWT 配置；P01-03 SSRF IP/重定向/DNS/内容超限；P01-04 旧图类型绑定/不可达/环/错误 Join/缺值；P01-05 草稿/V2 不改变 V1，兼容入口固定已选择版本，持久 Run 固定版本由 P02 验收；P01-06 用户/owner 迁移重复执行、邀请不越权；P01-07 JS 关闭不能经 API 绕过。所有脚本由本阶段 subagent 独立生成，运行后 gate。

Gate：权限/网络安全/发布/旧数据迁移通过；未知或危险旧配置明确不可运行，不为兼容放开任意执行。

### P02：持久化 DAG、异步 Worker 与恢复

目标：运行不依赖浏览器，并发正确、进程崩溃可恢复。

实施：

- 第 2 节 Run/Attempt/Event/Outbox 模型；POST /runs 返回 runId，API/Worker 分离，不依赖 Response。
- DAG ready queue、条件边、AND Join、节点超时/有限重试/取消/错误策略；节点独立上下文，成功输出持久化复用。
- 为 P06 提前实现有界 ForEach/批处理原语：项数/并发上限、逐项状态与稳定操作 key、部分失败/unknown 策略；P08 复用该原语，不让 P06 依赖尚未实现的 Agent 阶段。
- 状态+Outbox 事务、稳定 jobId、CAS、租约/fencing、恢复对账与补投；队列 Redis noeviction，与普通缓存分离，监测内存/连接/投递失败。
- ExternalOperation 基础，对不确定副作用标 unknown，不盲重试。
- 独立 JS 容器限制 CPU/内存/时间/输入输出/网络/文件系统；验收前关闭；平台无隔离则明确不可用，不回退主进程。

阶段末测试：P02-01 串行/并行/菱形/分支/Join 空激活与不同完成顺序；P02-02 节点/Run 不串上下文，冲突变量拒绝或显式合并；P02-03 各事务/投递/结果边界 kill Worker，恢复继续；P02-04 重复 job/租约过期/旧 Worker 迟到写拒绝、成功节点不重跑；P02-05 Redis/DB 中断与队列缺失对账；P02-06 取消/超时/重试竞态与 Run 单终态；P02-07 外部接受后丢响应进入 unknown 或核验；P02-08 JS 死循环/越界/资源超限隔离且 API 正常；P02-09 持久 Run 固定 V1/输入，编辑与发布 V2 不改变它，新增 Run 端点权限；P02-10 有界 ForEach 项数/并发达限、每项 key 稳定且不同、部分成功/重复任务/取消/崩溃后逐项恢复。subagent 生成真实进程/DB 故障脚本，不全部 mock。

Gate：结果、DB 状态、attempt 数、外部动作次数一致。重启整个流程成功不等于断点恢复通过。

### P03：LLM 单次执行、SSE 回放与运行中心

目标：模型输出可复用，断线/刷新不重跑，前端准确显示运行和失败。

实施：

- LLM 在节点阶段调用一次，delta 是观察事件，完成后 final output 落库；多个下游读 final，不靠 ReplyNode 才执行模型流。Schema 校验、有限修复预算与明确错误；每 attempt usage，未知不记零。
- Worker 中断不能续接原 token 流：按策略终止或新 attempt，发送 reset/replace，明确可能重复费用。中间模型 delta 与最终回复分频道，不拼成一个气泡。
- GET /runs/:id 返回一致快照/highWaterSeq；GET /runs/:id/events?after=seq 订阅；POST /runs/:id/cancel 发持久取消意图。
- SSE id=seq，payload=node/attempt/type；先持久再送。历史与增量都从 DB 按 cursor 查，Redis 仅唤醒，遗漏通知周期补查；token 批量落库，阈值实测配置。
- 前端 fetch 流支持 Bearer/cookie、UTF-8切片、多行 data/半包/空行/终止帧；cursor 为已应用位置、重复去重、按 attempt 重置。断线退避/抖动，从 cursor 追同 Run，不 POST 创建新 Run；401/403/终态停止无效重连。
- 刷新先快照再从 highWaterSeq 追新，防双拼；事件保留窗口过期明确 reset_required 后取快照，不静默丢事件。
- 运行中心：历史/节点输入输出脱敏/状态/尝试/错误/usage/待审批。订阅关闭不取消，心跳不等于业务事件；慢客户端/回放/连接限额，超限关订阅不关任务；验收 Nginx 缓冲/空闲超时。
- UI 实施时读取适用前端 skill，沿用现有风格，不重做无关页面。

阶段末测试：P03-01 一次模型调用给多个下游/有限 JSON 修复；P03-02 断网/多次重连/刷新/切 API 实例，同 Run 恢复不增调用；P03-03 历史→实时缝隙、快照竞态、去重、旧 cursor，特别阻塞较早 event 事务验证较晚 seq 不能先可见导致永久漏事件；P03-04 中文 UTF-8/半包/多行/终止 parser；P03-05 Worker 中断 attempt reset/usage；P03-06 慢消费者/代理/新增 SSE 权限/连接限额；P03-07 Playwright 浏览器断网恢复，最终文字逐字匹配持久结果，不能只测 parser。subagent 生成脚本与事件轨迹断言。

Gate：完整事件与结果一致，普通重连不新增 Run/Attempt/provider 调用；中断策略和费用边界如实显示。

### P04：API、Webhook、定时触发与幂等

目标：服务真实业务入口，不依赖打开聊天页面。

实施：已发布版本可 API 运行；Idempotency-Key 以 workspace/调用方/入口作用域和请求 hash 唯一，同 key/payload 返回同 Run，不同 payload 409。API key 最小权限/hash 存储/撤销。Webhook 原始 body 签名、时间窗/重放防护与限流，不可猜 runId 即权限。

定时配置 cron/时区/下一触发预览；默认不重叠，错过不全量补跑并记录原因，政策可显式修改。实例唯一 `(triggerId,scheduledAt)`，多调度器 lease/唯一约束，重启对账。来源输入 schema，触发固定版本，换版本显式操作。

阶段末 subagent 测试：P04-01 并发相同 key 单 Run、不同 body 冲突；P04-02 Webhook 签名/篡改/过期/重放/撤销/租户；P04-03 时区/夏令时 fixtures、双调度器/重启、overlap/misfire；P04-04 外部入口与 UI 运行同引擎，日志无 secret。

Gate：多实例不重复触发、权限收口，重试请求不变重跑。

### P05：持久化人工审批与恢复

目标：能等待次日、跨进程继续，不挂起 Promise 占 Worker。

实施：ApprovalTask 落库/节点 waiting_approval 释放 Worker；角色/指定人员授权，通知受控链接。审批收件箱、批准/拒绝/修改、截止政策；CAS 单决定。修改草案新版本/hash、schema 再验证与审计，不改变原图或偷偷执行工具。决定+继续 Outbox 同事务；超时/取消/批准以明确 CAS 状态契约处理，已取消不复活；截止任务可恢复，通知失败不丢审批。

阶段末 subagent 测试：P05-01 等待无 Worker 占用、重启仍待审批；P05-02 非审批人/跨租户/过期链接；P05-03 同意与拒绝并发单决定/单下游动作；P05-04 批准后投递前崩溃恢复；P05-05 超时/取消/批准竞态；P05-06 非法修改拒绝/合法版本审计；P05-07 Playwright 两个用户端收件箱与 Run 状态一致、通知失败可查。

Gate：等待/恢复/权限/决定单次生效全通过，DB 与下游次数可证明。

### P06：PRD 评审→审批→Jira 完整闭环

目标：可演示复杂业务与故障处置，不是空壳节点集合。

入口：现有 `docs/workflows/flow-a-prd-review.md` 和样例 PRD，编排节点、Connection、Approval、运行视图。先整理明确输入/输出 schema 与准入规则。

实施：业务/技术并行评审，规范查询可暂接已有检索但其可靠性 P07 前未验收；聚合结构化问题/任务草案。若有评分/阈值，服务器确定性规则算准入，不让 LLM 自行决定是否绕过审核。资料缺失/未达标生成整改报告；达标经人工审批后有界 ForEach 创建 Jira 任务、保存映射/通知。实际下发的是审批后版本。

Jira Connector 最小权限、timeout/429/5xx、稳定操作标记/对账/外部 id。不能假定 Jira 原生支持任意 Idempotency-Key，开工核实实际目标 API；无法确认已创建则 unknown+人工处理。部分成功逐项存状态，不重跑成功项，不自动删任务补偿。通知沿用副作用治理，先实现一个有真实配置的渠道，未接通渠道不可选。

模板可导入/有示例/审批入口/真实任务链接；链接来自 Connector，不来自模型虚构。模型/HTTP/MCP fixtures 只验收行为，不冒充真实效果。

阶段末 subagent 测试：P06-01 合法 PRD→并行→Join→审批修改→只创建批准任务；P06-02 资料不足/评审失败/非法 JSON/拒绝/取消无 Jira 写；P06-03 协议 fake server 429/5xx/丢响应/部分成功，重试不重复或明确 unknown；P06-04 断网/刷新/Worker重启恢复闭环；P06-05 多租户 secret/任务隔离；P06-LIVE 在授权真实测试 Jira 项目创建受控任务，核验内容、映射与重试行为，保存脱敏证据。

Gate：业务/故障通过且 live 完成；缺真实 Jira 配置，contract 可绿但阶段最高 PARTIAL。真实事项清理需明确授权，不能自动删除生产事项。

### P07：RAG 数据生命周期与检索可信度

目标：规范查询可靠、版本可追溯，不用随机回退伪装正常检索。

实施：文档上传/解析/分块/embedding 持久作业，进度/错误/取消可查；chunk 幂等、重试恢复、删除/权限一致。索引绑定 provider/model/dimension/配置版本，维度/批量顺序/内容校验。无 embedding 明确失败，或显式独立关键词模式并标注；禁止本地 256 维回退混真实空间。

模型/维度更换走影子重建→验证→原子切换；旧索引切换前可用。rerank score 独立命名，不混检索 score；引用到文档/chunk 版本。建立人工标注组织规范 fixtures，报告 Recall@K/MRR 等的样本/口径；先测基线再冻结门槛，不结果出来后调口径。扫描 PDF 等不支持项明确失败，不产生假完成。

阶段末 subagent 测试：P07-01 上传→解析→embedding→检索→真实引用；P07-02 kill/重复 chunk/计数/损坏文件/超限/删除并发；P07-03 无 provider/维度错/批量顺序错拒绝；P07-04 影子失败不切换/切换一致；P07-05 租户隔离/关键词标记；P07-06 固定评测报告与 P06 规范检索回归。真实模型评测另列模型/参数/成本，mock 不作为质量提升证据。

Gate：生命周期与空间一致性通过，在标注集锁定认可基线；API 200 不代表质量。

### P08：真实 MCP、有界 Agent 与可控循环

目标：把 Agent 纳入可靠流程，而不是二选一。

实施：先远程 HTTP MCP，真实 initialize/工具发现/调用/输出校验；SDK/协议版本开工官方核实。secret 加密、工具 allowlist、读写分类/授权、timeout/并发/大小与出站边界。发布固定工具能力快照，重新发现变化不能静默扩大已有版本权限。stdio 普通用户不能任意执行，管理员批准隔离连接且通过隔离测试前禁用。

AgentNode 固定 schema、最大步骤/时间/token/工具预算，每步持久 child attempt/操作。模型提出调用，服务端授权/校验/预算，写工具走审批和 ExternalOperation；检索内容/prompt injection 不变系统权限。ForEach 项数/并发有上限，每项稳定 key、部分失败策略，不开放任意回边。

阶段末 subagent 测试：P08-01 真协议 fake MCP 发现/调用/断连/认证/schema；P08-02 禁止工具/恶意参数/超大输出/prompt injection 不触发禁动作；P08-03 步骤/token/时间/ForEach 达限停止；P08-04 工具中断幂等/unknown、恢复不丢历史重写副作用；P08-05 secret/租户隔离/工具列表变更不提权；P08-LIVE 授权只读真实 MCP smoke，写工具只在单独授权测试环境验证；如开放 stdio，追加隔离白名单测试。

Gate：真实协议/授权/预算/副作用边界通过；无真实 endpoint 的 live 缺口不隐藏，配置 CRUD 不算完成。

### P09：配额、可观测性、发布门禁与最终演练

目标：可安全运营，知道为何失败，升级可恢复，并用证据讲项目。

实施：workspace 并发/请求/token/成本预算，原子预留/结算、失败释放、崩溃未结算对账；unknown usage 明确 pending，不无限免费放行。权限/版本/审批/连接 use/副作用审计、资源分类保留/清理；默认不记 secret/全文输入。

关联 request/run/node/attempt trace，监测积压/失败/租约/Outbox/SSE重连/SMTP失败/provider用量，告警配处置 runbook。启动配置/就绪存活/优雅退出/池与资源边界。API/Worker/隔离器只拿必需 secret，不全量注入 .env。

CI 必选测试/类型检查/build 后产版本化镜像；生产部署明确授权，不 push main 自动绕 gate。DB expand→backfill→切换→后续 contract，先备份/演练，迁移独立任务不多实例并发执行。回滚旧镜像+兼容 schema，不删除已有数据“恢复”。真实第三方 smoke 独立保护，不在普通 PR CI 使用生产凭证。

阶段末 subagent 测试：P09-01 多实例配额/重复结算/崩溃预留恢复；P09-02 trace/脱敏/指标告警故障；P09-03 staging 迁移/备份恢复/旧新兼容/镜像回滚；P09-04 固定机器/数据量/并发负载报告及预先冻结预算，观察慢 SSE/队列/内存；P09-05 干净环境 P00–P08 全回归；P09-06 邮箱登录→PRD→断线→审批→外部结果→审计全链路演练，保存 trace/DB 事实。

Gate：所有必选阶段 PASS；外部缺口不藏 skip。交付 API 契约、样例流程、升级/回滚/故障 runbook、测试报告与面试复盘。无生产授权只交可部署产物，不自动上线。

## 5. 风险、迁移与失败后动作

| 风险 | 预防 | 发生后怎么办 |
| --- | --- | --- |
| 邮件不达 | TLS/发件域/授权邮箱、投递可观察 | 页面等待/重发，查脱敏 Message-ID 和收件箱，缺证据 PARTIAL，不暴露 OTP |
| 老账号无法访问 | 保留 id/owner，可信绑定路径 | 授权管理员审计恢复；无法证明不交资源，不猜归属，不重开旧漏洞 |
| 历史图不兼容 | fixtures/dry-run/发布校验 | 留原图，报告不可运行节点，修后新发布，不改历史版本 |
| DB/queue 不一致 | 同事务 Outbox、幂等/恢复对账 | 查 Outbox/NodeRun 补投，不把所有 running 重跑 |
| 外部写成功但响应丢失 | 稳定标记/目标支持的幂等 | unknown、核验或人工确认，不自动重复创建/删除 |
| SSE丢通知/旧 cursor | 持久事件/增量查询/保留策略 | 补查或 reset_required 取快照，不重启 Run |
| Worker/代码耗尽资源 | lease/fencing/隔离/timeout | 杀隔离器、明确失败，恢复未完成节点，保护 API/其他租户 |
| 迁移/发布失败 | 兼容迁移/备份/staging/独立任务 | 停发布、回兼容应用或演练过的备份恢复；删除/覆盖另外确认 |
| 环境不可用/flaky | 健康检查/固定版本/时钟/种子 | BLOCKED/FAIL，修设施或竞态，留首次失败，不碰巧绿就通过 |

后续每阶段先查 git diff，保留无关修改。依据用户 2026-10-06 最新授权，使用功能分支 feat/enterprise-workflow，每阶段所有必选验收 PASS 后单独 commit；P00–P09 整体通过后才 push 到现有 origin，创建目标为 main 的 PR 并运行/检查 CI。不自动 merge 或 deploy，不写额外账号/仓库/云盘。真实邮箱/Jira/MCP 测试明确目标，清理只限确认属于本次测试且获删除授权的资源。

## 6. 顺序与进度记录

主线 P00→P01→P02→P03→P04→P05→P06→P07→P08→P09。P06 初始检索可靠性不算通过，P07 后回归业务闭环。阶段内独立模块可并行，但测试 subagent 与主 agent 不改同一业务文件，不能绕验收依赖。

| 阶段 | 本轮状态 | 后续证据 |
| --- | --- | --- |
| P00 | IN_PROGRESS | 本地完整验收已通过；依据用户要求暂缓 LIVE 邮箱实收，不影响独立实现，但不宣称完整通过或提交 |
| P01 | IN_PROGRESS | 已实现秘密加密/显式迁移、安全出站和 Workspace 成员/邀请 API；185 项安全、18项验收入口及68项Workspace独立测试通过，统一冻结回归另行运行；完整资源角色矩阵/连接 use/真实网络出口/历史迁移仍缺口 |
| P02 | IN_PROGRESS | 持久化 DAG/独立 Worker/副作用/JS 容器隔离已实现；真实测试以 artifacts/acceptance/P02 报告为准，依赖未通过，不提前提交 |
| P03 | NOT_STARTED | 模型调用计数/SSE/浏览器 trace |
| P04 | NOT_STARTED | 幂等/签名/调度竞态 |
| P05 | NOT_STARTED | 审批权限/竞态/恢复 |
| P06 | NOT_STARTED | PRD/Jira contract/live |
| P07 | NOT_STARTED | 生命周期/空间一致/真实评测 |
| P08 | NOT_STARTED | MCP协议/Agent预算/工具授权 |
| P09 | NOT_STARTED | 全回归/负载/迁移恢复/演练 |

第一批从 P00：工作区绑定→隔离环境与 contract→DB迁移→SMTP/Challenge/Session→前端→subagent独立测试→实际执行→真实收件 gate。SMTP 暂缺可做 Mailpit 开发，但阶段未通过。

计划编写时仅交付计划与回读检查；之后已生成业务与独立测试并实际执行。文件存在/build 成功不能作为任一阶段 PASS。计划结构自动检查覆盖 P00–P09 各自的阶段标题、subagent 测试要求与 Gate；独立 subagent 全文审阅发现的依赖、事件提交顺序与旧 JWT 撤销问题已修订。2026-10-07 用户要求暂缓邮箱、继续后续阶段：不再等待 SMTP 配置，继续独立可实现工作；不把 LIVE 缺口记为通过、不降低阶段 commit 与整体 PR 门禁。

## 7. 官方设计依据与后续复核

源码事实见第 1 节。以下官方资料支持机制选择，不证明未经运行的效果：

- [Nodemailer SMTP](https://nodemailer.com/smtp)：transport/配置/verify；verify 不等于收件箱收到。
- [Mailpit API](https://mailpit.axllent.org/docs/api-v1/)：隔离收信验证，不替代外网投递。
- [BullMQ 幂等任务](https://docs.bullmq.io/patterns/idempotent-jobs)：重试需业务幂等，不提供业务 exactly-once。
- [BullMQ 生产配置](https://docs.bullmq.io/guide/going-to-production)：队列 Redis 持久化/淘汰/连接，不能直接沿缓存 allkeys-lru。
- [WHATWG SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html)：帧/id/重连语义；fetch 客户端自己实现解析/cursor。
- [Playwright reporters](https://playwright.dev/docs/test-reporters)：可追溯报告；trace/截图核实固定版本配置。

对应阶段开工再查 MCP SDK/协议、Jira API、SMTP provider、隔离器平台和测试工具官方接口。吞吐/延迟/效果/费用来自后续测试，没有数据写“待测试”。
