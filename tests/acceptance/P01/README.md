# P01 当前子能力验收

所有 P00/P01/P02 统一入口及独立 runner 使用同一 checkout 的 artifacts/acceptance/.workspace.lock。不可同时执行多个 stage：原生 Prisma DLL 与构建输出是工作区共享资源。第二个入口会在执行任何 stage 命令前拒绝；不是跳过测试后标 PASS。正常成功/失败均释放锁；进程崩溃留下的锁不自动抢占，因为子进程可能仍持有 DLL。需先确认相关验收及子进程全部退出，再清理这一指定锁文件，不能删除整个 artifacts 目录。

验收入口自身的回归（不运行整个 stage、不读业务环境、不发送邮箱）：

    node --test tests/acceptance/P01/runner-regression.test.cjs

这些测试通过 TypeScript AST 提取并执行实际入口的版本解析和环境白名单代码，避免复制实现造成假通过。覆盖 pnpm 前置提示、唯一独立版本行、歧义/命令失败拒绝、敏感业务变量不继承、安装目录缺失，以及旧解析/旧白名单负对照。Windows 另实际执行只读 `docker compose version`，确认新白名单发现插件、旧白名单失败；此负对照针对当前已核实的 Windows Docker 安装布局，其他布局若旧白名单也成功应审查测试前提，不能删除负对照强行通过。非 Windows 会明确 skip 该项，不能声称验证 Windows 插件发现。原 185 个安全断言门槛与完整阶段不可完成边界保持不变。

    pnpm exec tsx tests/acceptance/P01/verify-local.ts

这是当前子能力入口，不是完整 P01 验收。顺序为验收入口自身回归 → Prisma generate → 后端全仓 tsc → build → 只读 lint → Docker → 测试 postgres → migrate deploy → jest-security.json 全套安全测试 → Workspace 真实 PG/Nest HTTP 测试。任何失败不会被局部通过掩盖；缺 Docker/PG 时标 BLOCKED。不会改系统代理，不会删除数据库或 volume，不部署。

环境来自 tests/support/environment.ts，固定 PostgreSQL 127.0.0.1:15432/nexus_test，脚本主动拒绝非隔离目标。不读取生产 .env、不继承生产业务密钥，不发送真实邮箱或访问生产服务器。fixture 使用各 suite 的随机资源标识与限定清理，迁移测试有 owner 范围过滤，不运行全表生产秘密迁移。

全套必须发现 tenant-regressions、legacy-boundaries、chunking-boundaries、p01-secrets、p01-outbound 五个 suite，至少保留当前已验证的 185 个断言，skip/todo/fail 必须为零。后续合法增加断言不需修改入口；删除或跳过测试必须先核查合同，不能降低最小数来强行通过。

Workspace suite 为 workspace.e2e.spec.ts，至少 68 项且零失败/skip/todo；原安全 suite 至少 185 项。两组报告分别审查，不能用一组新增测试抵消另一组缺失测试。

报告位于 artifacts/acceptance/P01/<run-id>/report.json 和 gate.xml，包含 Git revision/branch、Node/pnpm/TypeScript 版本、开始结束源码哈希、源码清单、命令退出码、用例计数、结构化案例名、缺失 Case IDs。执行期间源码变化即失败，须冻结重跑。

保密策略：子进程 stdout/stderr 不发布；原始 Jest JSON 仅放随机临时目录，解析后销毁。仅提取数量、状态以及 suite#case-N 结构化名称，不发布参数化标题、原始失败 expect、SQL、fixture 值、JWT、密钥。最终产物另做敏感值/JWT 扫描。失败时主代理在受控本地单独 debug，不能把原始失败 payload 当公开验收报告。

contractStatus 为 PASS/FAIL/BLOCKED；无失败且设施具备时 overallStatus 只能 PARTIAL，绝不为完整 P01 PASS。退出码 1 表示失败；2 表示 PARTIAL 或 BLOCKED，不能据此触发完整阶段 commit。

Workspace 测试的可信身份由专用 fixture guard 提供，生产不存在该 header 认证路径；不是完整 JWT 测试。邀请 API 验证邮箱匹配与审计不等于邮件已实发。工作区完整 Case IDs P01-01 至 P01-07 仍列在 missingCaseIDs：各项已有局部证据但未满足整项合同。缺口包括全资源角色权限与连接 use 授权、邀请邮件与历史 owner 迁移、真实 TLS 与网络出口、旧图迁移/兼容不可变发布，以及完整 JWT/JS API 绕过覆盖。
