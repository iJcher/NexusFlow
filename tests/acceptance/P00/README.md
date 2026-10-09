# P00 真实邮箱登录验收

自动测试由独立测试 subagent 编写，不把现有行为当正确契约。后端测试见 `backend-node/test/auth/`，浏览器测试见 `tests/e2e/p00-auth.spec.ts`。

## 本地验收

准备 Node.js、pnpm、Docker Compose 和 Chromium。先在根、backend-node、front 按各自 lockfile 安装依赖，再运行 `pnpm exec playwright install chromium`。

```powershell
pnpm verify:stage -- P00 --local
```

入口使用 `tests/support/environment.ts` 的隔离常量，强制 NODE_ENV=test、库名 nexus_test、PostgreSQL 15432、Redis 16379。不会读取现有生产 `.env`，不会连接生产数据库。测试 Compose 只绑定 loopback；验收不执行 volume 删除、清生产数据或关闭用户服务。测试数据库可持久保留，只操作随机前缀的测试身份。

步骤：隔离/脱敏基础单测→前端 test:auth→后端构建/前端类型检查与构建→只读 lint→Compose 启动依赖→Prisma generate/migrate deploy→真实 API 测试→真实浏览器→结果汇总。Docker 阻塞也保留可执行的单测/构建证据，已执行 FAIL 优先于 BLOCKED。Playwright 自行启动 API 31050、Vue 5175，测试配置不复用未知服务器。Mailpit SMTP 11025/API 18025 是本地真实 SMTP 链路，但不是外网投递。

产物在 `artifacts/acceptance/P00/<run-id>/`，包含 `report.json`、`gate.xml`、脱敏运行日志和测试报告。认证 trace、视频和截图默认关闭；不可可靠脱敏的二进制产物不发布。临时原始 reporter 文件只在独立临时目录，完成后脱敏发布并清除此临时目录。

所有日志及嵌套文本/XML/JSON产物在发布前脱敏，并扫描已知签名key/pepper及JWT；发现敏感内容则抑制对应产物并 FAIL。`dirtyDiffSha256` 包含 tracked/untracked 源码文件内容 hash 与 git 状态；报告只列路径/hash，不打印源码，排除 `.env`、credentials/secrets目录、字体/二进制、依赖和产物。

运行开始/结束的源码manifest摘要必须一致，运行时其他进程修改源码/config则 FAIL，待工作树冻结后重跑。前端lint启用CI非交互模式；即使进程exit0，出现缺插件/安装询问也不能算PASS。Mailpit容器running后还需有界轮询API就绪，不能用端口启动竞态冒充功能失败。Mailpit使用明确版本 [v1.27.10官方发布](https://github.com/axllent/mailpit/releases/tag/v1.27.10)；镜像实际拉取/digest验证仍受Docker代理阻碍，不声称已验证镜像下载。

后端必选验证包括真实 API 在 SMTP DATA pending 时被 kill、重启后 pending 验证码不可用；独立临时数据库从历史 SQL 真实迁移并重复 deploy 后用户/流程/知识库归属不变；隔离子进程实际注入“消费后仍接受验证码”的恶意实现，共用正常 single-use 断言必须得到非零退出。普通错误验证码测试不冒充 mutation negative-control。

退出码：0 全阶段 PASS；1 已执行验收 FAIL；2 缺依赖/授权/真实收件证据 BLOCKED。所有本地测试通过但缺真实邮箱证据仍为 `localStatus=PASS, overallStatus=BLOCKED`，不是完整验收成功。出现必选 skip/todo/flaky、缺案例标识、报告缺失均不得 PASS。`verify:all` 在其他阶段尚未实现时返回 BLOCKED，不伪造全绿。

## 真实 SMTP / 收件箱验收

需要用户通过安全环境配置给独立测试 API 设置实际 SMTP（host/port/TLS/user/password/from），且 API 配置明确 Origin。现有服务器也可使用，不能默认授权生产身份/数据变更。首先授权唯一测试邮箱，禁止批量收件。密钥不要贴到聊天、提交到 Git 或放在命令行。

在交互终端配置非秘密运行参数，再运行：

```powershell
$env:LIVE_INTEGRATION = '1'
$env:LIVE_TEST_EMAIL = '<授权测试邮箱>'
$env:LIVE_EMAIL_ALLOWED_RECIPIENT = '<同一个授权测试邮箱>'
$env:LIVE_API_URL = 'https://<授权测试API>'
$env:LIVE_ORIGIN = 'https://<该API允许的前端Origin>'
pnpm verify:stage -- P00 --live
```

也可以 `pnpm exec tsx tests/acceptance/P00/live-email-smoke.ts` 单独运行 smoke。脚本先检查权限/配置再发一封邮件。收件人从实际邮箱中读取验证码和该邮件原始邮件头中的实际 Message-ID，按两行依次隐藏输入；报告只保存 Message-ID 的 SHA-256，缺失不能 PASS。脚本通过真实验证码完成登录、访问受保护接口并退出撤销会话。OTP、token、cookie 不保存，也不从数据库/调试接口读码。人工收件步骤明确标注，不声称无人值守自动化。

本地真实 SMTP 测试可以单独启动 API（例如 loopback 31060）并将 LIVE_API_URL 指向该实例；其真实 SMTP 配置与本地 Mailpit 配置必须分开，不能把 `.env.test.example` 当生产/真实 SMTP 配置。脚本不会代替用户启动/部署 live API，也不会修改服务器配置。

SMTP verify、accepted、Mailpit 邮件均不能代替 LIVE 实收；缺 SMTP/授权邮箱/交互输入时 BLOCKED，零邮件发送。真实邮箱产生的新测试用户只在授权测试工作区保留，不自动删除/解绑现有用户。
