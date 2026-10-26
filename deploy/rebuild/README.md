# 新工作台运行说明

本启动器运行 Spring Boot 控制面、Python LangGraph Runtime 和 Vue Studio，不启动旧 NestJS Runtime。当前为 Windows 本机环境，不是公网生产部署方案。

## 配置

将同目录 `.env.example` 复制为 `.env`，配置：

- `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL_ID`：OpenAI-compatible 模型连接，仅服务端读取。
- `NEXUS_OWNER_EMAIL`：首次验证码登录后绑定初始工作空间的所有者邮箱，其他账号不会继承模型权限。
- `SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM`：真实邮箱验证码发送连接。

PowerShell 设置 `$env:NF_POSTGRES_BIN` 为 PostgreSQL bin 目录。可选 `$env:NF_MODEL_ENV_FILE` 指向其他私有模型配置文件；未设置时优先读取本目录 `.env`。原开发机的已授权配置路径仅保留为本地兼容 fallback，新克隆无需该目录。

完整安装和启动命令见[仓库首页](../../README.md)。`setup` 初始化隔离数据库 `nexus_rebuild:19432`，创建 `nf_control` 与 `nf_runtime`，按新增迁移和 checksum 管理表结构，并初始化原生 Checkpointer。密码随机生成并保存在忽略的 `.local/config.json`。

| 服务 | 地址 |
| --- | --- |
| Vue Studio | http://127.0.0.1:30061/rebuild.html |
| Java 控制面 | http://127.0.0.1:19081 |
| Python Runtime | http://127.0.0.1:19082 |
| PostgreSQL | 127.0.0.1:19432/nexus_rebuild |

## 停止、重启和升级

从仓库根目录执行，每条成功后再运行下一条：

```powershell
.\runtime-python\.venv\Scripts\python.exe deploy/rebuild/dev.py restart-python
.\runtime-python\.venv\Scripts\python.exe deploy/rebuild/dev.py restart-java
.\runtime-python\.venv\Scripts\python.exe deploy/rebuild/dev.py stop-front
```

支持 `python/java/front` 及相应 `stop-*`、`restart-*`。脚本核对进程身份，保留数据库。Windows 运行中的 Java 会锁住 JAR；修改 Java 后应先 `stop-java`，再 Maven package，最后启动 Java。

Python Runtime 单活动运行。可信执行版本归档位于 `runtime-python/.local/bundles/{digest}`，恢复旧 Run 需要同时保留数据库、对应归档及兼容依赖。旧归档缺失或版本不兼容会明确拒绝；不能通过修改运行的版本引用强行加载新代码。归档不提交 Git，应作为部署数据备份。

迁移采用新增文件方式，不修改已应用 SQL 的 checksum。模型 Key、SMTP 密钥、服务 Token 和 Cookie 不应进入前端或发布定义。日志与 PID 位于 `.local`，不提交 Git。

## 日常使用

使用邮箱验证码登录，创建 Agent 或 Workflow，先在右侧试运行再发布。Workflow/Agent 调用绑定已发布版本，更换配置不修改旧 Run。工具连接授权后自动选择，敏感写工具仍未开放。

根 Agent 的同 Thread 对话具有短期上下文、自动摘要与自动长期记忆；每轮仍有独立 Run。Workflow 与独立预览不隐式共享聊天上下文。人工确认、执行动态和结果在同一 SSE 对话中显示；新建对话时可读取已保存偏好。

界面错误通过中上方 Toast 提示。未配置模型或无使用权时，应检查当前 Workspace 与连接授权；不要将其他用户加入初始模型空间绕过隔离。
