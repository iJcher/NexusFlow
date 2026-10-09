# P00 独立认证验收

由测试 subagent 按冻结接口合同编写。业务实现不能作为断言来源；脚本不修改业务源码，也不跳过必选案例。

统一入口：仓库根目录 `pnpm verify:stage -- P00`。独立入口 `pnpm --dir backend-node test:auth` 和 `pnpm exec playwright test -c playwright.config.ts` 必须由 runner 注入 `tests/support/environment.ts` 的隔离环境并先完成测试迁移。

## 案例与证据

| 合同 ID | 脚本/断言 |
| --- | --- |
| P00-AUTH-01 | API 与浏览器真实 SMTP → Mailpit → 收件码登录；数据库 verified user/session/single consumption；白名单 DTO 与受保护页面 |
| P00-AUTH-02 | 非法邮箱/类型/控制字符/多余字段/码格式双层拒绝；trim/域名大小写与 +tag；浏览器无非法请求 |
| P00-AUTH-03 | 错码计数提交、第五次锁定、过期/用途/异邮箱/已用/禁用用户；重发成功使旧 challenge 失效 |
| P00-AUTH-04 | 多真实实例并发消费一次、并发发送一次；共享邮箱/IP/全局预算与伪造代理头；Redis 不可用拒绝；新 challenge 不重置邮箱验证预算 |
| P00-AUTH-05 | 真实 SMTP 连接拒绝、协议 550、超时；重发失败保留旧码与错误次数、清除 pending 且新挑战 delivery_unknown；缺配置与生产不安全 SMTP 拒绝；真实子进程发送 DATA 未确认时 kill/restart，pending 正确码拒绝 |
| P00-AUTH-06 | cookie 属性、Origin、轮换/重放 family 撤销、跨实例并发刷新仅一次成功且重放族全部撤销，同用户另一登录族不受影响；退出即时撤销、过期/禁用；旧入口 410、旧签名及新签名旧格式 token 拒绝；用户详情/list 只读本人；旧 SQL 填充隔离数据库后真实 migrate deploy 两次保留用户/流程/知识库归属 |
| P00-AUTH-07 | DB 不保存明文 OTP、响应不返回 refresh token；真实测试子进程恶意重复消费返回两次 200，共享单次消费断言导致该进程退出码 2，证明负对照确实会红 |
| P00-AUTH-13 | 邮箱修改清码；刷新页面后服务器冷却仍有效 |

`auth-worker.ts` 只用于测试子进程。恶意覆写开关仅存在于测试目录，生产源码无对应开关。正常并发验收和恶意子进程均使用 `assertions.ts` 的同一 `assertSingleUse`。

旧数据迁移测试只创建 `nexus_p00_migration_<随机16位hex>` 数据库，执行仓库原始 SQL 并登记 legacy migration，再运行实际 Prisma migrate deploy；清理仅限经正则验证且本测试确实创建的临时数据库。主测试拒绝非本机 `nexus_test` 数据库，不允许指向生产。

API replicas 在同一 suite 共用随机 Redis prefix，浏览器 suite 另用一个 prefix，避免历史测试污染预算而不放宽生产限制。低预算测试用真实 ConfigService 的配置快照，不 mock Redis、Prisma、AuthService 或 MailService；只有故意破坏的独立负对照覆写 AuthService。

认证 trace/HAR/视频/截图全部关闭，不断言输出完整 response/cookie/token/code。runner 应汇总首次失败、退出码、JUnit/JSON与脱敏日志并扫描敏感产物。专用子进程和迁移 CLI 不输出原始 SMTP/SQL/token 参数。

## 已验证与边界

2026-10-07 独立执行：22/22 后端认证测试通过，使用真实本机隔离 PostgreSQL（15432）、Redis（16379）、Mailpit（11025/18025）与随机 nf:p00 Redis 前缀。覆盖 API、并发刷新/验证码消费、SMTP 失败与进程终止、真实旧数据迁移两遍及恶意重复消费负对照；未停止共享容器，清理仅本测试创建的身份与随机迁移数据库。专项 ESLint（零错误/警告）及 backend `tsc --noEmit --incremental false` 均通过。

这次独立测试不替代正式冻结 stage runner 报告、前端浏览器测试、全仓 lint 或 LIVE gate；不得据局部 22/22 宣称 P00 整体通过。

P00-AUTH-LIVE 不由本脚本伪造：Mailpit、SMTP accepted、浏览器本地登录都不能证明真实收件箱收到。需要授权 SMTP 与收件邮箱，单独保留真实收件与登录的脱敏证据后才可满足 LIVE gate。
