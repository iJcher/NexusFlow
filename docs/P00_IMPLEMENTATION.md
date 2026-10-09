# P00 实现与验收记录

## 工作区与 Git 约定

本次在同一个 Git 仓库的工作树 D:\Code\NexusFlow\implementation 上实现，
分支 feat/enterprise-workflow，起点 a4e9629。原始 main 工作树保留。
阶段计划以本工作树 NEXUS_ENTERPRISE_PLAN.md 为准。

每个 stage 必选验收全部 PASS 才单独 commit；P00–P09 全部通过后才
push 到原有 origin 并创建目标 main 的 PR、检查 CI。不自动合并或部署。
已有 Deploy NEXUS workflow_dispatch 会部署服务器，不把它当作 PR 测试触发。

## 已实现，但不能宣称已验收

邮箱挑战以 UUID 标识，数据库只保存带独立 pepper 的 HMAC 验证码摘要。
SMTP 接受后才激活新挑战；发送中断/不确定不激活，重发失败保留旧有效码。
数据库事务和按邮箱 advisory lock 保证一次消费、持久错误次数和并发身份创建。
共享 Redis 限制邮箱/IP/全局发信量，Redis 故障返回 503，不绕过限制。

Access token 仅前端内存保存；HttpOnly、SameSite=Strict refresh cookie 在服务端
持久化摘要，轮换、重用撤销整个会话族；受保护请求校验真实会话与用户状态。
Origin 白名单、旧入口 410、独立 JWT 签名密钥使旧认证不能旁路新认证。
未把历史手机号与邮箱自动关联，历史 UserEntity ID 和资源归属保留。

登录表单有邮箱/六位验证码校验、冷却、防重复发送、错误反馈、记住邮箱。
刷新请求同页面合并；会话 generation 阻止退出后迟到刷新恢复登录态。
多个浏览器标签页的协调尚未实现，不宣称跨标签页无刷新竞争。

## 独立测试与证据边界

subagent 独立生成前端组件/store 测试、真实 API/进程故障测试、
Playwright 浏览器测试和统一 JSON/JUnit 门禁。
API 使用真实 PostgreSQL、Redis、Mailpit 与 Nodemailer，不用假 MailService。
包含 SMTP DATA pending 时杀进程、历史 SQL 迁移两遍检查 owner 保留、
故意允许验证码重复消费的测试子进程必须被同一断言判失败。

已执行的前端 20 个诊断案例通过；更早的正式运行中认证单测和两端构建通过。
后续格式变更后，pnpm 正式入口出现 ERR_PNPM_TRUST_DOWNGRADE：
chokidar@4.0.3、undici-types@6.21.0、vite@6.4.1。
此提示不是证实这些包恶意，但不能绕过策略当作通过；需核对来源与兼容版本。
后端认证修改文件专项 lint 已通过。
全仓 lint 仍失败；未修改旧工作流等模块来隐藏失败，未关闭规则。
真实 Chromium 页面渲染检查无 pageerror，390px 手机布局无横向溢出；
截图只是无认证数据的页面检查，不证明真实邮件登录。

现有报告保留在 artifacts/acceptance/P00/ 下，不能当作当前源码版本的 PASS。
报告带源码内容 hash；执行期间源码变动也会 FAIL。
当前 P00 未通过，未 commit/push/PR，P01–P09 未开始。

## 本地重跑

前提：Node >=22.13.0、pnpm 11.22.0、Docker 正常，先解决依赖信任检查。
在本工作树分别冻结安装根目录、backend-node、front 的锁文件：

    pnpm install --frozen-lockfile
    pnpm --dir backend-node install --frozen-lockfile
    pnpm --dir front install --frozen-lockfile
    pnpm exec playwright install chromium
    pnpm verify:stage -- P00 --local

runner 使用专用测试端口/数据库，不连接用户生产服务器。
本地通过仍缺必选 LIVE，整体会 BLOCKED，不能据 exit 2 提交阶段通过。
不要为变绿增加跳过项、放松断言或禁用供应链规则。

当前 Docker Desktop 代理指向不可达 192.168.1.104:7897，镜像拉取失败。
需用户恢复代理，或明确授权临时修改并恢复系统配置；本次未修改代理。

## 真实 SMTP 和真实收件箱验收

凭证填入被 Git 忽略的本地 .env，不贴聊天、不提交。见根 .env.example：
AUTH_JWT_SECRET 与 AUTH_EMAIL_CODE_PEPPER 独立生成，不复用旧 JWT_SECRET；
AUTH_ALLOWED_ORIGINS 精确配置实际 origin。
SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM 必填。587 默认 STARTTLS；
465 配 SMTP_SECURE=true。生产禁止 SMTP_ALLOW_INSECURE=true，并要求 HTTPS。

先完成 Mailpit 集成测试，再独立启动配置真实 SMTP 的 API。
真实发信前明确授权一个测试收件邮箱，LIVE_INTEGRATION=1，
LIVE_TEST_EMAIL 与 LIVE_EMAIL_ALLOWED_RECIPIENT 必须完全一致。
LIVE_API_URL 先使用直接 API 的 http://127.0.0.1:30050（非 Nginx /api 前缀），
LIVE_ORIGIN 必须匹配该 API 的白名单。
配置使用当前终端的环境，不把密码写成命令行参数。交互式运行：

    pnpm verify:stage -- P00 --live

用户从实际收件箱输入该封邮件的验证码和 Message-ID，输入不回显；
报告只留收件人/Message-ID 的 hash 与时间，不保留验证码/token/cookie。
SMTP 接受和 Mailpit 收件不能替代这个门禁。缺配置/授权/交互输入不发信。

## 迁移与上线边界

仅本地隔离测试库可以自动迁移；当前未访问、迁移或部署用户服务器。
生产切换前必须备份数据库并验证恢复，在 staging 执行 migrate deploy，
核对旧用户 ID/资源 owner、邮件投递、TLS/cookie/Origin/可信反代 CIDR。
TRUSTED_PROXY_CIDRS 只配置实际可信反代，空值不信任伪造转发头。
新邮箱首次登录创建独立账户；历史账户关联需另行设计本人验证流程。
SMTP/密钥不齐时服务会启动失败，不应盲目触发旧自动部署。
本阶段迁移新增表/可空字段；回滚前端/服务不等于允许删除会话表或恢复旧 JWT。
发现故障先停止发布、恢复上一已验证服务版本、保留新表与旧数据；
数据库破坏只能用已经演练过的备份恢复流程，不执行 reset/drop 生产数据。
