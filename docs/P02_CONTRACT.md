# P02 执行合同 v1

用户要求继续 Stage 2，允许在 P00 未通过时实现；不降低验收标准、不提前 commit。
本阶段新增的私有 Workspace、成员与不可变版本只是 P01 必要依赖，不代表 P01 已通过。

## API

- POST /workflows/:flowId/versions {graph}：源 Flow 必须归当前用户，发布需 Owner/Editor。
- POST /runs {versionId,input}：202 {runId,status}，Owner/Operator，停用版本不能创建。
- GET /runs/:id：一致性快照 Run、nodes/attempts/operations/highWaterSeq，workspace 成员可看。
- GET /runs/:id/events?after=0：有序事件，P03 才提供 SSE。
- POST /runs/:id/cancel：持久取消、幂等，不修改已终止的 Run。
- POST /runs/:id/operations/:operationId/resolve：仅 Owner，{decision:'succeeded'|'not_executed',reason,output?}；
  reason 至少 10 字符，必须人为核验，记录事件。needs_attention 允许核验后恢复，
  succeeded/failed/cancelled 终态不能恢复。

## Graph

{schemaVersion:1,inputSchema,nodes,edges}，最多 200 节点、1000 边；
一个 start，全部从 start 可达，无环。输入/输出必须显式内联 JSON Schema，不允许 $ref。
Node={id,kind,inputSchema,outputSchema,inputBindings,config?,timeoutMs?,maxAttempts?,onError?}。
kind=start|constant|transform|condition|merge|delay|foreach|http|js。
Binding={source:'literal',value}|{source:'runInput',path}
|{source:'node',nodeId,path,optional?,default?}。path 使用 JSON Pointer，只能引用祖先。
每节点独立上下文，读取持久化前驱输出；不共享变量或 currentNode。
Edge={id,from,to,branch?}，condition 出边明确 branch true/false。
AND Join 等全部入边解析，无 active 入边就跳过并传播 inactive。
condition config={path,operator:eq|neq|gte|truthy,value?}，返回 {matched:boolean}。
constant config={value} 返回值；start/merge 返回 inputs。
transform config={operation:identity|sum|concat|sha256}；sum/concat 读 inputs.values；
sha256 返回 {hash}。delay config={milliseconds}，可取消，返回 inputs。
timeoutMs 100..120000，maxAttempts 1..5，onError fail|continue。

## ForEach / 外部动作

foreach inputs.items 为数组；config={maxItems<=1000,concurrency<=32,itemIdPath?,
failurePolicy:'fail'|'continue',action:{kind:'transform'|'delay'|'http',inputSchema,outputSchema,config?,
timeoutMs?,maxAttempts?}}。子 inputs={item,index}；稳定 itemId 缺省为固定输入快照中的索引，
提供 itemIdPath 时必须唯一。每项独立 NodeRun/Attempt/operation key。
单个 Run 包括展开项的 NodeRun 总量最多 5000，超过在展开事务内拒绝。
结果 {items:[{itemId,status,output?,errorCode?}]} 保持原顺序；重启不重跑成功项。
HTTP config={url,method:'GET'|'POST'}，POST body=inputs；仅 HTTPS、精确允许域名、
DNS 公网 IPv4 pinning、无重定向、大小/时间上限，不接受任意凭证 headers。
写动作先记录 executing 再发请求；丢响应/租约超时标 unknown，暂停 needs_attention，
不盲重试。key 不随 attempt 改变且不同项不同。
JS 默认关闭；新 js 节点仅显式 WORKFLOW_JS_ENABLED=true 后可发布，
config 仅允许 code（async function(inputs) 函数体，最多 16KiB）。
ContainerJsExecutor 仅运行管理员配置的 node@sha256 固定摘要镜像，禁止自动 pull。
容器 UID 65532、read-only、network none、cap-drop ALL、no-new-privileges，
CPU 0.5、内存/含 swap 128MiB、pids 32；无宿主目录/socket挂载、无宿主密钥注入。
每个执行器进程最多并行 2 容器，输入/输出各最多 64KiB，执行含启动最长 5 秒。
超限/取消清理仅本次 nf-js-UUID 容器，不回退 node:vm 或主进程执行。
旧 JSCodeNode/JSExpressionUnit 仍关闭；新隔离测试未通过前不能启用生产。
共享内核容器并非绝对安全；生产需独立受信隔离执行节点和 daemon，不让公开 API
持有 Docker socket。多 Worker 的全局配额和沙箱宿主运维属于后续阶段，不在本地测试中冒充完成。

## 存储与恢复

PostgreSQL 保存 FlowRun/NodeRun/NodeAttempt/RunEdge/RunEvent/RunOutbox/ExternalOperation。
Run 行锁串行推进，状态+事件/outbox 原子提交；seq 按 Run 提交顺序递增。
BullMQ 投递只携带 runId/nodeId。Worker 独立进程，claim fencing+租约；
晚到完成 CAS 被拒，成功输出永久复用。恢复重投 ready、推进 retry_wait、处理过期租约。
恢复扫描按 ID 游标循环，needs_attention 不会永久阻挡后续 Run。
Redis 队列独立 noeviction，不与缓存共用。纯节点有限重试，外部不确定结果人工核验。
取消停止新 claim 并尽力 abort，不承诺撤回已发生的外部动作。

## 验收

独立 subagent 生成 compiler/scheduler/binding 单测，以及真实 PG/Redis/BullMQ、
Worker kill/restart/重复投递/旧 fencing/取消/HTTP fixture/ForEach 恢复脚本。
不以 mock/build 替代集成；缺基础设施应 BLOCKED。JS 隔离能力与 P00/P01 依赖
未通过时，P02 整体不能 PASS；只证明 fail-closed 不等于证明隔离执行已完成。
