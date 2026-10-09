# P02 持久化执行实现与运行手册

分支 feat/enterprise-workflow。本阶段未通过全部依赖门禁，不提前 commit/push/部署。
接口与图定义见 P02_CONTRACT.md；统一验收：pnpm verify:stage -- P02 --local。
这是独立持久化 Run 入口，旧设计器/聊天入口尚未迁移；运行中心/SSE 属于 P03。

## 请求到恢复的真实路径

1. API 发布不可变 WorkflowVersion，创建 Run 时固定版本和输入。
2. 同一 PostgreSQL 事务创建 Run/NodeRun/边，写顺序事件及 ready Outbox。
3. 独立 Worker 投递 Outbox 到专用 Redis BullMQ，任务仅含 runId/nodeId。
4. Worker 在 Run 行锁下 claim，解析固定输入，记录 attempt，颁发租约和 fencing。
5. 完成/失败回到行锁事务，拒绝过期 fencing，原子更新状态、事件及后继 Outbox。
6. 恢复扫描游标轮询：到期租约、retry_wait、队列丢失的 ready 对账。
   成功节点复用既有输出；ForEach 每项有独立身份和 attempt。

POST /runs 返回 202，不长期阻塞等待结果。GET 快照和增量事件可查询进展。
GET 事件分页目前不是 SSE，不能宣称支持浏览器 SSE 断线重连。

## 外部 POST 及并行故障

先持久化 ExternalOperation.executing 再发送。operationKey 不随 attempt 改变。
不假定远端遵守 Idempotency-Key。响应丢失/进程崩溃进入 unknown，
暂停 Run 为 needs_attention，Owner 提供核验理由与结果后才可恢复。
并行分支致命失败，取消尚未 claim 的项；已经在途的项保留 running，
Run 标记 NODE_FAILED 并等待结果，不能提前 failed 切断核验入口。
unknown 优先保留人工核验，核验后按原致命失败最终 failed，保留动作及审计。
已经发生的外部动作不会因另一分支失败而被撤回。

## 进程与配置

本机构建后，配置专用 DATABASE_URL/WORKFLOW_REDIS_URL，再执行
pnpm --dir backend-node start:worker。API/Worker 是不同进程；Worker 不监听 HTTP。
不得将测试端口/测试密钥用于生产。队列必须 noeviction，不能复用缓存 Redis。

docker-compose.workflow.yml 是现有 Compose 的附加文件，增加 queue-redis/run-worker。
Worker 只注入数据库与队列配置，不注入 SMTP/JWT/整个 .env。
本轮仅检查 Compose 配置，未构建/启动生产镜像，未部署服务器。
部署前必须单独完成迁移、备份和阶段验收并取得部署授权。
原 API 的全量 env_file 与启动内迁移仍是旧部署行为，尚未通过 P09 发布验收。

## JS 隔离

ContainerJsExecutor 默认关闭。管理员须显式配置 API/Worker 开关及固定摘要镜像。
Docker CLI/受信 daemon 不可用就失败，无主进程执行回退，无自动拉镜像。
每次运行独立低权限容器，无宿主目录/socket挂载，无宿主密钥注入；
资源、网络、文件系统及并发限额见契约。旧 JSCodeNode/JSExpressionUnit 仍关闭。
附加 Compose 不开放 Docker socket，JS 保持 false；公网 API 不接宿主 daemon。
本地真实测试证明容器边界，不代表抵御全部内核漏洞、多实例全局配额或生产沙箱运维。
生产应使用独立受信隔离执行节点，不在普通 API 容器挂 daemon socket。

## 故障处置

- Redis 不可用：Run/Outbox 留在 PG；恢复 Redis 后检查发布及 attempt，
  不清 PG、不从 start 重跑。noeviction 资源耗尽会拒绝写，不会静默驱逐。
- PG 不可用：无法可信提交结果，心跳失效会 abort；恢复后按租约/fencing 对账。
  POST 响应与提交不确定需人工核验，不因远端 200 就认定持久状态成功。
- needs_attention：核对真实业务事实，由 Owner 选择 succeeded/not_executed 并写理由。
  无法确认就保持暂停，不盲重试。
- 取消：停止新 claim、尽力 abort，不保证撤销远端已接受的动作。
- JS 超限：只清理本次随机命名容器。daemon 故障后管理员检查带
  nexusflow.js-executor=true 标签的孤立容器，不运行宽泛 prune 或删除其他容器。

## 已发现的迁移编码问题

原 20260513205145_init/migration.sql 带 UTF-8 BOM，干净 PG 第一行失败。
本轮只移除 BOM，不改 SQL 语义。测试库失败记录标记 rolled-back 后重跑成功。
服务器从未操作。若服务器已应用该迁移，发布前必须核对迁移历史/checksum；
不能对服务器 reset，也不能照抄测试库 resolve。历史文件变更不得隐藏。

## 验收边界

独立测试覆盖真实 PG/BullMQ/Redis、Worker kill、HTTP fixture、角色矩阵、
ForEach逐项恢复、TCP断链及Docker资源隔离。最终状态以冻结源码报告为准。
TCP gate 销毁真实 socket 并拒绝新连接，证明连接中断，不冒充容器停机或主机重启。
角色矩阵在测试 App 注入身份，不替代 P00 JWT/邮箱认证验收。
JS 健康 HTTP 用测试服务，不证明完整 App 在隔离压测下全部可用。
尚未证明长时分区、PG commit 结果不明的全部事务边界、完整服务主机重启、
完整发布角色矩阵、生产部署/备份恢复。P00/P01 未通过时 P02 整体最高 BLOCKED。
