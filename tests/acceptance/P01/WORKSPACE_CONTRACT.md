# P01 Workspace 子契约：真实数据库与 HTTP 验收

这是独立测试代理编写的 Workspace 子能力验收，不代表完整 P01 验收通过。测试文件为 `backend-node/test/workspace/workspace.e2e.spec.ts`，配置为 `backend-node/test/jest-workspace-e2e.json`。

## 运行

先由主验收流程启动 `docker-compose.test.yml` 的 PostgreSQL，并对隔离测试库应用包含 `20261009000100_workspace_invitations` 的迁移。测试拒绝除 `127.0.0.1:15432/nexus_test` 以外的 DATABASE_URL，不读取生产配置或 SMTP。

```powershell
$env:NODE_ENV='test'
$env:DATABASE_URL='postgresql://nexus_test:nexus_test_only@127.0.0.1:15432/nexus_test?schema=public'
pnpm --dir backend-node exec jest --config test/jest-workspace-e2e.json --runInBand
pnpm --dir backend-node exec tsc --noEmit --incremental false
pnpm --dir backend-node exec eslint test/workspace/workspace.e2e.spec.ts
```

正常验收标准：1 个 suite、68 个测试全部通过；无 skipped、todo；只删除随机创建的用户、工作区、流程及其关联数据。实际 Jest 输出与 P01 统一 runner 冻结报告才是结果证据，本文件的 case 数仅是测试源定义。

## 测试设计与覆盖

所有业务查询、并发锁、邀请和审计写入均执行真实 PostgreSQL。HTTP 层启动真实 Nest 应用，使用生产 WorkspaceController、ValidationPipe 与 CurrentUser decorator，通过 Supertest 发请求。

HTTP 使用测试专用 FixtureGuard 提供可信身份。`x-fixture-user`、`x-fixture-email` 仅存在于这个测试应用，生产没有此登录入口。它不验证 JWT 签名、会话撤销或生产全局 guard 安装；这些仍由认证阶段及完整应用测试承担。

| Case ID | 可复现断言 |
| --- | --- |
| WS-IDENTITY | ensurePrivate 重入及 8 次首次并发只产生 1 个 Workspace/Owner；既有 UserEntity 内容、ID 和归属不变；重入不重复写创建审计 |
| WS-PUBLISH-RACE | 首次 ensurePrivate 与同一 Owner 两个不同流程的 publish 并发，三者全部成功且共享唯一 Workspace、Owner 和两条版本 |
| WS-INVITE-ACL | Owner/Editor/Operator/Approver/Viewer 完整邀请发起矩阵，只有 Owner 成功；外工作区 Owner 不具有本工作区授权 |
| WS-INVITE-ROLES | 四种可邀请角色创建并接受成功；Owner、大小写变体、空角色等拒绝且零写入 |
| WS-INPUT | 非法 email、超长 email、非法 UUID/memberId、额外 DTO 字段拒绝；服务归一化 email；自邀请、重复待接受邀请拒绝 |
| WS-EMAIL-DB | 接受邀请以数据库 email/emailVerifiedAt 为准；伪造请求邮箱无效；错误请求邮箱不妨碍真实 DB 邮箱匹配的接受 |
| WS-ACCEPT-BODY | 接受请求额外 userId/role 被白名单拒绝，邀请和成员不变；空对象正常接受 |
| WS-ACCEPT-RACE | 同一邀请 6 次并发 HTTP 接受，恰好 1 次 201、5 次 409，只新增 1 个成员和 1 条接受审计 |
| WS-INVITE-STATE | 过期/撤销邀请不可接受；跨工作区撤销目标不命中；邀请不能覆盖已有成员权限 |
| WS-OWNER | Owner 不可被移除或降级到任一四种角色；四种非 Owner 角色不可改成员、移除成员、撤销邀请或查看成员管理列表 |
| WS-REVOCATION | 成员降级、移除立即反映 list；RunsRepository 再次授权读取真实成员表：Operator→Viewer 后不能创建新 run，仍可读旧 run；移除后创建和读取均拒绝 |
| WS-ACTIVE | 被停用/删除/锁定用户不能接受、创建私人工作区或列举工作区；数据库零新增工作区 |
| WS-AUDIT-ATOMIC | 对创建、邀请、接受、撤销、改角色、移除六种操作注入审计失败，真实 SQL 事务回滚，成员、邀请状态、数量、工作区均保持原值 |
| WS-AUDIT-MIN | 审计只含既定 ID/action/role/timestamp 字段，不包含邀请 email；不存在自由文本或密钥字段 |
| WS-ANON | 所有八个 HTTP 路由无身份返回 401 且零业务写入；所有控制器 handler/class 不带 Public 元数据 |
| WS-NEGATIVE | 内存中暂时绕过 Owner 授权，**同一个**“外人邀请必须 Forbidden”的断言变红；恢复后原断言再次通过 |

负对照不更改生产代码、不降低断言，且在 finally/afterEach 恢复 spy。负对照产生的邀请也位于独立随机 fixture 范围并在测试结束清理。审计故障注入只使审计函数抛错，事务、业务写入与回滚均为真实数据库操作，而非 mock Prisma 回滚。

## 尚未覆盖 / 不可据此声称的能力

- 完整 P01 的旧资源 Workspace 归属迁移、跨资源 RBAC、Connection 使用权限等尚未接入此 suite。
- 不是生产 JWT 全应用匿名绕过证明；专用 guard 与 Public 元数据检查只验证子契约边界。
- 邀请送信、SMTP 真实外部邮箱投递不在此范围；用户已要求暂不等待邮箱。
- 不以审计字段白名单测试代替全系统日志脱敏/保留审计验证。
- 尚未测试邀请待处理数量达到 100 的边界、全部异常进程崩溃与事务提交未知结果。邀请过期测试直接设置过去的数据库时间，不等待七天。
- 不模拟/证明成员撤权和另一授权事务同时进行时的严格全局线性化；此处证明的是更新提交后的后续请求即时重新授权。

统一验收仍需读取生成前后 source hash，保留已有 185 个安全测试门槛，并额外要求上述 Workspace suite 全部通过；不能将子契约 PASS 变成 P01 整阶段 PASS。
