# 旧 NestJS 后端

此目录保留旧平台业务源码。Java / LangGraph 重构版工作台使用 `backend-java/` 与 `runtime-python/`，不依赖此目录的 DAG 执行引擎；新栈启动见[仓库首页](../README.md)。旧后端最终退役尚未完成。

旧环境如需单独运行，从本目录安装依赖并配置服务端环境变量：

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm start:dev
```

依赖 PostgreSQL、Redis 等原有服务，具体变量见根目录 `.env.example`。不要把旧数据库配置用于新栈隔离数据库；密钥与真实业务数据不得提交 Git。
