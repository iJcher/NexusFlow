# NexusFlow 前端

Vue 3 + TypeScript + Vue Flow。工作台默认入口为 `/`，已有 `/rebuild.html` 地址继续可用，两者使用同一套 Java/Python 后端。

```powershell
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1 --port 30061
pnpm type-check
pnpm build
```

在 `front/` 目录逐条执行。新工作台的 `/api/v2` 开发代理指向本机 Java `19081`；后端启动与连接配置见[运行说明](../deploy/rebuild/README.md)。构建产物位于忽略目录 `dist/`。

智能体与工作流使用独立编辑路由，可拖动调整配置/预览宽度。试运行采用 SSE 对话式反馈；定义草稿自动保存，发布版本与已有运行保持隔离。
