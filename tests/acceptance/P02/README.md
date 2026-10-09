# P02 持久化执行验收

合同是 `docs/P02_CONTRACT.md`；实现准备不代表阶段通过。独立测试 agent 生成 compiler/bindings/scheduler 单测及真实 PostgreSQL、Redis、BullMQ、Worker 子进程故障测试。

```powershell
pnpm verify:stage -- P02 --local
# 或直接：
pnpm exec tsx scripts/verify-p02.ts
```

顺序：无需 Docker 的 runs 单测→Prisma 客户端生成→后端 build/类型检查→P02 专项只读 lint→Docker 依赖/真实迁移→runs 集成。Docker 缺失时仍保存已经执行的单测/build证据，执行 FAIL 优先于 BLOCKED。root/package scripts 由主 agent 注册。

隔离目标固定为 PostgreSQL `127.0.0.1:15432/nexus_test`，队列 Redis `127.0.0.1:16380`。新增 `queue-redis` 使用 noeviction+AOF，不能与认证/缓存 Redis 16379 共用；旧端口不变。队列名/prefix有本轮随机命名空间，DB fixture同样限定测试资源，不清生产数据，不执行volume删除。入口不读取生产 `.env`、不部署、不发真实邮件或外部业务写请求。

报告位置：`artifacts/acceptance/P02/<run-id>/report.json`、`gate.xml`、脱敏日志和 Jest JSON/JUnit。记录 git revision、开始/结束 tracked+untracked 文字源码 hash、案例计数和命令退出码；排除 .env/秘密目录/字体二进制/依赖产物，不输出源码或凭据。执行时源码/config变化必须冻结后重跑。敏感产物先脱敏再扫描，不能只扫描JSON键。

必须实际跑真实PG/Redis/BullMQ和进程kill/restart，不能把mock或build当恢复证据。Jest必选skip/todo均为零；过期租约/fencing、成功输出复用、状态+事件+outbox事务、幂等外部operation、ForEach逐项恢复需脚本断言。

P00/P01 未验收、真实JS低权限隔离验收未通过时，**P02整体必须BLOCKED**（若本阶段已有执行失败则FAIL）。新容器执行器默认关闭，旧JS入口始终关闭，不能用fail-closed替代真实隔离测试。unitStatus/integrationStatus/jsIsolationStatus单列，不能用局部PASS触发stage commit，不提供跳过依赖的强制PASS参数。

退出码：0完整PASS（当前合同尚不可取得）；1验收失败；2缺设施/依赖/隔离证据。修复本机Docker/代理需要明确授权，入口不改系统代理。任何外部provider smoke另外授权，不在此runner调用。

## 独立测试与负对照

直接单测：pnpm --dir backend-node exec jest --config test/jest-runs-unit.json --runInBand。
负对照：pnpm exec tsx tests/acceptance/P02/negative-control.ts。

负对照先在独立子进程运行原始 52 项 core 断言，再仅在测试进程覆盖 scheduler 的导出，让 Join 提前 ready；仍执行相同断言。正常组必须全绿、破坏组必须明确失败且不能 skip。生产代码不修改。2026-10-07 本轮实际结果：原始 52 passed、破坏组 7 failed / 45 passed，负对照脚本退出 0。报告保存在 artifacts/acceptance/P02/negative-control-*，此结果只证明纯逻辑断言的检测能力。

| 案例 | 脚本 | 必须观察的事实 |
| --- | --- | --- |
| P02-01/02 | core.spec.ts | 分支/AND Join、顺序无关、绑定深拷贝、祖先与类型限制 |
| P02-03/04 | recovery.e2e-spec.ts | 子进程已提交 claim 后 kill、重复 claim、晚完成 fencing、成功项 attempt 不增长 |
| P02-05 | worker.e2e-spec.ts | 独立 noeviction Redis 的真实 BullMQ 队列丢失后由 PostgreSQL ready 对账补投 |
| P02-06 | recovery + worker | 有界重试、实际 timeout/abort、取消单终态、下游零 attempt |
| P02-07 | recovery + worker + http-fixture.ts | 真实 loopback socket 响应丢失/POST 接受后 kill、unknown 不重复、Owner 核验/Operator 拒绝、稳定 key |
| P02-09 | recovery.e2e-spec.ts | V1/输入快照不变、跨用户禁止、停用禁止创建 |
| P02-10 | recovery + worker | slot 上限、部分失败策略、重复 ID/超项数原子失败、真实 Worker 重启复用成功项及逐项不同 key |

HTTP loopback adapter只存在测试 subprocess，覆盖真实传输失败与副作用状态机，不代表生产 HTTP 出口 DNS pinning/SSRF 安全已验收。测试强制 WORKFLOW_QUEUE_PREFIX 为 nf-p02- 后接本轮随机串；queue.obliterate 仅在该独立命名空间且 Worker 未启动时运行，不清 Redis/volume。

本轮新增真实 TCP gate 断链恢复（transport-outage.e2e-spec.ts）、HTTP 5类角色矩阵（api.e2e-spec.ts）、真实 Docker JS 隔离（js-isolation.e2e-spec.ts）以及并行致命失败+在途 POST 核验回归。JS 历次失败与修复见 JS_ISOLATION_TEST_HISTORY.md；最终统计以冻结源码后的统一报告为准。

仍有缺口：TCP gate 不代表服务容器停止/主机重启或长时网络分区；HTTP 测试身份注入不替代 P00 JWT，发布接口完整角色矩阵仍未覆盖；PG commit 结果不明的所有事务边界、生产沙箱宿主运维/全局配额未验收。P00/P01依赖未通过，不提前提交阶段。
