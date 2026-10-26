# NexusFlow

可视化 Agentic Workflow 编排平台，使用 **Vue 3 + Spring Boot + Python LangChain/LangGraph + PostgreSQL** 构建。

当前分支使用 Java / LangGraph 架构，工作台默认入口为 `/`，已有 `/rebuild.html` 地址继续可用。后端由 Spring Boot 控制面与 Python Runtime 组成。

## 核心功能

- 结构化工作流：顺序、条件分支、并行/ALL Join、共享 State 与受控 Reducer。
- Workflow、Agent 四向调用，固定发布版本、父子调用关系及预算传播。
- PostgreSQL Checkpoint、根级 Outbox/Inbox、人工审批挂起及重启恢复。
- MCP 工具发现与缓存、Agent 自主选择已授权工具、工作空间隔离与受控出站。
- SSE 对话调试、公开执行动态、审批操作和历史会话恢复。
- 多轮上下文、自动摘要、自动提取长期偏好、跨会话记忆及自然语言更正/忘记。

## 代码目录

| 目录 | 职责 |
| --- | --- |
| `backend-java/` | 身份、Workspace、定义发布、审批、连接治理、Outbox、SSE 转发 |
| `runtime-python/nexus/` | 原生图与 Agent 执行、Checkpoint、工具、运行记录及记忆 |
| `front/src/features/studio/product/` | 新工作台、画布、Agent 配置、对话调试 |
| `contracts/execution-dsl/v2/` | 运行所需 DSL、事件 Schema 及 API 协议 |
| `deploy/rebuild/` | 本机启动脚本、配置模板和使用说明 |

## 启动

当前启动器面向 Windows，需要 Python 3.12、Java 21、Maven、Node.js/pnpm 和 PostgreSQL 二进制；安装包不包含在仓库中。

1. 将 `deploy/rebuild/.env.example` 复制为同目录 `.env`，填写模型、SMTP 和所有者邮箱 `NEXUS_OWNER_EMAIL`。该邮箱验证码登录后绑定本机初始空间；其他账号不会自动获得此模型使用权。
2. 在 PowerShell 指定 PostgreSQL bin 目录，例如：

   ```powershell
   $env:NF_POSTGRES_BIN = 'C:\Program Files\PostgreSQL\17\bin'
   ```

3. 从仓库根目录逐条执行：

   ```powershell
   py -3.12 -m venv runtime-python/.venv
   .\runtime-python\.venv\Scripts\python.exe -m pip install -r runtime-python/requirements.lock.txt
   pnpm --dir front install --frozen-lockfile
   .\runtime-python\.venv\Scripts\python.exe deploy/rebuild/dev.py setup
   mvn -f backend-java/pom.xml package
   .\runtime-python\.venv\Scripts\python.exe deploy/rebuild/dev.py python
   .\runtime-python\.venv\Scripts\python.exe deploy/rebuild/dev.py java
   .\runtime-python\.venv\Scripts\python.exe deploy/rebuild/dev.py front
   ```

4. 打开 <http://127.0.0.1:30061/>，通过邮箱验证码登录。

更多配置和重启说明见 [运行手册](deploy/rebuild/README.md)，执行协议见 [API](contracts/execution-dsl/v2/API.md)。数据库、凭据、原始对话和本机执行归档均不随代码上传。

## 使用

创建智能体并配置模型和任务。连接并授权 MCP 服务后，Agent 根据任务自动选择工具；工具白名单属于高级限制。草稿自动保存，右侧可以试运行，发布后供其他执行单元固定版本调用。

工作流可以组合 Agent、分支、并行和人工确认。运行中通过同一对话查看 SSE 动态和审批；服务重启后可以恢复。新对话会读取当前用户在该 Agent 下的长期记忆，也可以通过自然语言更正或要求忘记。

## 当前边界

目前为单活动 Python Runtime、本机开发部署。多 Worker 高可用、外部业务写入 Exactly-Once、复杂语义记忆检索、长程资源治理和公网生产部署仍未交付。累计 Token 预留保持不限量，权限、调用次数、输入窗口、超时和取消仍生效。
