# P01 连接秘密子契约

此子契约不代表完整 P01。暂缓邮箱实收不改变原必选验收，也不触发阶段提交。

1. AES-256-GCM、随机 12-byte nonce、16-byte tag；密文标明 v1/keyId。AAD 绑定类型、id、owner、字段，跨资源复制和篡改失败。密文不等于日志可公开数据。
2. CONNECTION_ENCRYPTION_KEYS 是 keyId 到 32-byte canonical base64 的 JSON；CONNECTION_ACTIVE_KEY_ID 指定写入 key。无自动生成/默认密钥；缺失/非法/生产 test keyId 启动失败。生产通过托管 secret 注入，测试使用独立明确配置。
3. 模型 API Key、MCP env/headers 在数据库中只存密文。外部 DTO 的秘密为 ****，不返回首尾片段或密文；仅 owner 限定的内部读取解密。无 owner 的历史 provider 不变公开。
4. 显式 migrateConnectionSecrets 支持 dryRun、ownerUserId、batchSize。按 ID 分批、每行 CAS 保留并发新写；成功后重复执行不再加密。已有 envelope 必须验证，损坏不当明文重包。迁移只修改秘密字段，不改变 id/owner；记录 counts 与密文 hash，不输出旧明文。默认 dryRun。
5. 迁移前备份由授权运维在目标环境执行，先演练；旧明文不回退解密。暂停 API/Worker 写入后 apply 并检查无明文残留，再切换应用。回滚应用必须兼容密文，不能恢复成明文运行。旧数据库备份仍含明文，需要独立限制访问/保留策略。
6. 当前子阶段不包含完整 Connection use 授权、Workspace 共享或秘密轮换运维闭环；不能把 owner 校验等同成员权限矩阵。
