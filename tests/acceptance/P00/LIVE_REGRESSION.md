# 真实邮箱 smoke 的独立回归

运行：

```powershell
node --test tests/acceptance/P00/live-email-regression.test.cjs
```

测试通过 TypeScript 的 AST 转换，仅替换隐藏人工输入函数，随后在 VM 中执行实际 `live-email-smoke.ts` 的 `run`、`apiData` 和 `validatePending`。模拟 HTTP、内存文件系统及 TTY 边界，未读取 `.env.live`、真实邮箱、数据库或 SMTP 凭据，也不发送真实邮件。

覆盖授权/Origin/API URL 限制、无 TTY 零发送、正确嵌套 API envelope、两阶段 PENDING/完成、已有 pending 或发送 intent 不重发、共享目录并发发送仅一次 HTTP 请求、请求失败后 intent 阻止盲目重发、pending 的收件人/API/Origin/UUID/时间绑定、实际输入验证、登录身份、Cookie、异常后的退出、退出后 token 必须拒绝访问，以及报告不保留邮箱/OTP/token/Cookie/Message-ID 原文。

这些测试只证明 smoke 的判定逻辑，不代替真实 SMTP 收件及验证码登录验收。真实发送成功仅可为 PENDING；只有实际收件输入及后续认证、注销与 token 撤销均成功，才可写 LIVE PASS。
