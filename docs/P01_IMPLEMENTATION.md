# P01 实施进度与操作说明

当前只完成安全子能力，不代表整个 P01。代码在 feat/enterprise-workflow，未部署到服务器，未执行生产数据迁移。邮箱按用户要求暂缓，不等待 SMTP。

## 本轮已实施

1. SecretVault：AES-256-GCM、随机 nonce、带 keyId 的 v1 envelope；AAD 绑定 resource/owner/field。keyring 允许旧 key 解密、新 active key 写入；不自动删除旧 key，不自动重加密历史密文。缺 key、错误 key、篡改、错误上下文、未加密读取均明确失败。
2. 新模型 API Key 和 MCP env/headers 加密写入原字段；DTO 仅返回 ****，禁止首尾片段泄漏。解密只在内部 owner 限定调用，普通 GetById 不存在 includeSecret 旁路。历史明文必须迁移，不能把新写策略当全库已完成。
3. migrateConnectionSecrets：默认 dryRun；按 ID 分批，单行 CAS 保留并发新写，保留 id/owner；损坏 envelope 和错误对象拒绝，二次执行不会双重加密。报告只有计数和密文汇总 hash，无旧明文。未自动在启动阶段执行。
4. safeFetch：HTTPS/443 精确域名、全部 DNS 地址验证与连接 IP 固定、无重定向、无代理/全局连接池回退；请求与响应大小、流式背压、DNS/总期限、取消及提前 close 处理。旧 HTTP、LLM、Embedding、Rerank、Skill 已接入。P02 持久 HTTP 有额外副作用策略，不以旧调用替代。
5. 移除 Skill/LLM 失败路径中原始模型响应、URL 查询和生成全文的日志/错误回传，使用稳定失败代码。未声称整个系统所有日志已完成 P09 审计。
6. Workspace 成员与邀请 API：身份来自服务端，Owner 管理非 Owner 角色；目标已验证邮箱接受、过期/撤销/并发保护、同事务审计。邮箱实发与旧资源共享 ACL 未完成；见 P01_WORKSPACE_CONTRACT.md。

## 启动与迁移

独立配置 CONNECTION_ENCRYPTION_KEYS（keyId -> 32-byte canonical base64 的 JSON）、CONNECTION_ACTIVE_KEY_ID，以及 OUTBOUND_ALLOWED_HOSTS（精确 HTTPS 域名）。通过私密环境/secret manager 注入；不提交真实 key，不复用 JWT key。无 key 启动失败，空出站域名拒绝调用，没有默认万能密钥或网络放行。

测试入口的 tests/support/environment.ts 含专用测试 key，生产拒绝 test 开头 keyId。普通独立 Worker 当前不调用秘密 provider，所以不注入 API 的 keyring/JWT/SMTP；未来增加模型执行能力时需逐项补最小凭据，不全量复制环境。

迁移命令继承调用者已安全配置的环境，不自动读取未知 .env：

- pnpm --dir backend-node secrets:inspect：只检查，零写。
- pnpm --dir backend-node secrets:migrate：显式 apply，会修改所配置目标库的秘密字段。生产需单独授权；先备份/演练，暂停相关写入，保存脱敏报告，有 conflicts 或异常时不要切应用，应复查后重新执行。

保留旧解密 key 是回滚前提；旧镜像若不支持密文不能安全回滚。旧数据库备份仍含明文，需独立控制访问和保留。不能为了恢复启动而把数据库解密回明文。

## 独立回归

- secret 子集 37 项：真实隔离 PG + 加密运行时，包含 dryRun、重入、保留 owner/id、CAS、篡改/错误 key 和跨 owner。
- outbound 子集 61 项：mock DNS/HTTPS 输送层契约，包含白名单/混合私网、lookup 固定、重定向、流式限额/背压、取消/超时/提前 close。首次提前 close 断言真实失败，修业务后保留原断言通过。
- 合并历史安全回归当前 185 项。构建/类型检查/lint 与冻结报告另行复跑，不以独立测试结论替代阶段 gate。
- Workspace 独立 68 项：隔离 PG + Nest HTTP、角色矩阵、验证邮箱、并发创建/接受、撤销/过期、成员权限即时生效、事务回滚、审计字段及 Owner 旁路负对照。专用 fixture guard 不代表真实 JWT 链路已覆盖。

## 仍需继续实施/验收

各资源逐端点角色矩阵与 connection use 独立授权；历史资源 workspace 迁移；统一 Connection 模型和连接持久审计；旧图迁移报告与兼容发布固定版本；真实 TLS、网络出口隔离、上传内容限制及负向控制。当前 owner 私有边界不能冒充团队权限已经完成。

Embedding 的 TF-IDF 降级和 RAG 空间生命周期仍由 P07 处理，没有因为出站收口就声称检索可信。
