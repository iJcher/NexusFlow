# NEXUS 跨 Agent 持续开发上下文提示词

> 使用方式：在新的电脑、新的 Cursor Agent 或其他 AI 编程环境中，先把本文完整发送给 Agent，再让它开始阅读代码、制定计划和实施修改。
> 目标是让新的 Agent 尽快进入当前项目语境，避免重复解释产品定位、架构背景、已完成工作和开发约束。

## 一、给 Agent 的总提示词

你现在要接手一个名为 **NEXUS** 的全栈项目。请先阅读本提示词，再结合仓库代码进行判断，不要只根据提示词臆测实现细节。

你的工作目标不是做一个普通 Demo，而是持续把 NEXUS 打造成一个偏 Dify 风格的 **AI 工作流编排与上下文工程平台**。它需要具备可视化工作流、AI 对话、知识库 RAG、LLM Provider 管理、Skill 生成、MCP 工具接入、部署与可观测能力。这个项目会用于求职简历和面试展示，因此每次修改都要兼顾：真实可运行、架构能讲清楚、代码质量可接受、功能边界不过度膨胀。

请始终使用中文回答。开发时遵循 First Principles、YAGNI、KISS、SOLID、DRY。遇到功能需求时，先解释思路和边界，再列简短 todo，最后再改代码。不要上来就堆实现。

## 二、项目定位

NEXUS 的核心定位：

- 面向 AI 应用开发者和业务人员的可视化工作流平台。
- 通过画布编排 Start、LLM、Knowledge、Condition、HTTP、JS Code、Assign Variable、Reply、End 等节点。
- 支持在聊天页面运行工作流，通过 SSE 流式输出回答。
- 支持知识库上传、切片、检索，并在工作流中作为上下文来源。
- 支持用户配置不同 LLM Provider，用于聊天模型和 Embedding 模型。
- 未来重点增强方向是：DAG 工作流调度、RAG 效果、Skill 生成、MCP 工具生态、可观测性和部署工程化。

产品叙事可以概括为：

> NEXUS 是一个 AI 工作流编排与上下文工程平台，通过可视化 DAG 工作流、RAG 知识库、多模型 Provider、Skill 生成和 MCP 工具接入，把零散的 LLM 调用升级为可复用、可观测、可部署的 AI 应用流程。

## 三、技术栈

前端：

- Vue 3
- TypeScript
- Vite
- Pinia
- Vue Router
- Element Plus
- UnoCSS
- SCSS
- Vue Flow
- vue-i18n

后端：

- NestJS
- TypeScript
- Prisma
- PostgreSQL
- pgvector 镜像用于未来向量检索
- Redis 预留给缓存、SSE 广播、限流等能力
- JWT 认证

部署：

- Docker
- Docker Compose
- Nginx
- GitHub Actions
- 阿里云 ECS
- 阿里云 ARMS 前端监控

包管理器：

- 统一使用 pnpm。
- Windows PowerShell 中多条命令用 `;`，不要用 `&&`。

## 四、仓库结构

常见目录：

- `front/`：Vue 前端项目。
- `backend-node/`：NestJS 后端项目。
- `backend-node/prisma/schema.prisma`：数据库模型定义。
- `deploy/`：Nginx、远程部署脚本等。
- `.github/workflows/`：GitHub Actions 部署流水线。
- `docs/`：项目说明、排查记录、部署文档和上下文文档。

前端重点目录：

- `front/src/views/flow/designer/`：工作流设计器。
- `front/src/views/flow/designer/widgets/`：节点属性配置面板。
- `front/src/views/flow/chat-test/`：工作流聊天测试页。
- `front/src/services/`：前端 API service。
- `front/src/composables/`：组合式函数。
- `front/src/types/`：类型定义。
- `front/src/locales/`：国际化文案。

后端重点目录：

- `backend-node/src/flow/`：工作流 CRUD。
- `backend-node/src/workflow/`：工作流运行时、节点执行器、AI 流式接口。
- `backend-node/src/knowledge/`：知识库、文档切片、检索。
- `backend-node/src/llm-provider/`：LLM Provider 配置与模型选择。
- `backend-node/src/conversation/`：聊天会话与消息。
- `backend-node/src/auth/`：JWT 认证、当前用户装饰器。
- `backend-node/src/skill/`：工作流生成 Skill 的能力。
- `backend-node/src/mcp/`：MCP Server 配置管理与工具接入预留。

## 五、当前已完成的重要能力

多用户隔离：

- 核心模型逐步加入 `ownerUserId`。
- Flow、Knowledge Base、LLM Provider、Conversation、Message、Template 等数据需要按当前登录用户隔离。
- 后端控制器应通过 `@CurrentUser()` 获取 `AuthenticatedUser`，不要继续使用 `@Req() any` 或 header 里的 phoneNumber 作为用户身份。

工作流运行时：

- 原本是简单递归执行链路。
- 已升级为更接近 DAG 的 ready queue 调度思路。
- 运行时需要支持条件分支、并行分支、节点状态记录、上游成功判断。
- `FlowRuntimeContext` 中包含 `ownerUserId`，节点执行中查 Provider 和 Knowledge 时要传递用户上下文。

RAG：

- 知识库支持 `chunkSize`、`chunkOverlap`、`chunkStrategy`。
- 切片策略包括 fixed、paragraph、markdown。
- Embedding 调用失败时可以降级到 TF-IDF fallback，不要让外部 embedding 服务不稳定导致整个知识库不可用。
- 搜索结果需要带 `source`，便于前端展示来源。

LLM Provider：

- Provider 需要按用户隔离。
- API Key 默认应脱敏展示。
- 更新时不要用已脱敏字符串覆盖真实 Key。
- Embedding 模型和 Chat 模型要区分选择逻辑，不能简单只从聊天模型列表里查 Embedding。

Skill 与 MCP：

- Skill 不是普通 CRUD 表，而是把工作流炼化成可复用 Agent Skill。
- Skill 生成应参考 skill-creator 的规范，输出 `SKILL.md` 和相关文件结构。
- MCP 模块作为未来工具生态入口，负责管理外部 MCP Server、endpoint、command、headers、toolsJson、lastSyncAt 等信息。
- 前端已有 `/tool/skill` 路由方向，用于工具和 Skill 管理。

部署与监控：

- 已有 Docker Compose 结构：postgres、redis、api、nginx。
- 前端生产产物挂载到 nginx。
- 后端通过 `DATABASE_URL`、`JWT_SECRET` 等环境变量启动。
- 已补充 `/health` 健康检查。
- 前端已有 ARMS 初始化思路，通过环境变量控制是否启用。

## 六、本地开发和验证方式

日常开发不要每次推到 ECS 验证。推荐本地验证链路：

1. 本地启动 PostgreSQL：

```bash
docker run --name nexus-postgres-dev -e POSTGRES_USER=nexus -e POSTGRES_PASSWORD=nexus_password_change_me -e POSTGRES_DB=nexus -p 5432:5432 -d pgvector/pgvector:pg16
```

2. 配置 `backend-node/.env`：

```env
PORT=30050
NODE_ENV=development
DATABASE_URL=postgresql://nexus:nexus_password_change_me@localhost:5432/nexus
JWT_SECRET=please-change-this-to-a-random-string-in-development
```

3. 启动后端：

```bash
cd backend-node ; pnpm install ; pnpm prisma generate ; pnpm prisma db push ; pnpm run start:dev
```

4. 前端开发环境：

`front/.env.development` 应指向本地后端：

```env
VITE_API_BASE_URL=http://localhost:30050
```

启动前端：

```bash
cd front ; pnpm install ; pnpm run dev
```

访问：

```text
http://localhost:30051
```

部署前验证：

```bash
cd front ; pnpm run type-check ; pnpm run build
cd backend-node ; pnpm run build
```

注意：只要修改了前端 `.vue` 或 `.ts` 文件，最终都要在 `front/` 目录执行：

```bash
pnpm run type-check
```

## 七、前端开发规范

必须遵守：

- 所有 `.vue` 文件使用 `<script setup lang="ts">`。
- 禁止使用 `any`，除非极特殊情况且有充分理由。
- `ref`、`reactive` 显式标注泛型。
- props 和 emits 使用泛型方式定义。
- 面向用户的文案必须走 i18n，不要硬编码中文或英文。
- Element Plus 组件在模板中用 kebab-case，例如 `<el-button>`。
- 布局、间距、颜色等优先用 UnoCSS。
- 复杂样式、动画、Element Plus 深度覆盖使用 `<style scoped lang="scss">`。
- CSS 变量使用 `--nf-` 前缀。

设计风格：

- NEXUS 是偏暗色、科技感、FUI 风格的产品。
- UI 改动应遵循现有暗色 token、玻璃态、微光边框、克制动效。
- 不要随意引入新的大组件库或全新视觉体系。

## 八、后端开发规范

必须遵守：

- 控制器不要使用 `any`。
- 登录态接口优先使用 `@CurrentUser()`。
- Service 层负责权限和 owner 校验，不能只靠前端过滤。
- Prisma 查询涉及用户资源时必须带 `ownerUserId`。
- API Key、headers、tokens 等敏感数据不要明文返回给前端。
- 外部 LLM、Embedding、MCP 调用失败时要给出可诊断日志，但不要泄露密钥。
- 保持 API 返回结构与前端 service 类型一致。

## 九、开发工作方式

新 Agent 接手时请按这个流程：

1. 先读本提示词。
2. 再读相关文件，不要直接改代码。
3. 如果任务涉及多模块，先给出简短计划和 todo。
4. 修改范围要小，不做无关重构。
5. 保留用户已有改动，不要执行 `git reset --hard`、`git checkout --` 等破坏性命令。
6. 修改 `.vue` 或 `.ts` 后检查类型。
7. 最终回答要说明改了什么、怎么验证、是否有未完成风险。

如果用户语气急或不耐烦：

- 直接给结论和可执行步骤。
- 不要写太长。
- 不要解释一堆抽象概念。
- 优先解决当前阻塞。

## 十、下一步适合继续优化的方向

优先级从高到低：

1. 本地开发体验：补齐本地启动文档，减少“必须部署到 ECS 才能验证”的反馈链路，增加本地 seed 数据或一键初始化脚本。
2. 工作流运行稳定性：完善 DAG 调度边界，明确条件分支、并行分支、Join、失败节点策略，增加工作流运行日志和节点执行状态。
3. RAG 可解释性：前端展示检索来源，支持知识库切片预览，增加检索参数可配置。
4. Skill 生成：让工作流生成 Skill 的结果更规范，支持预览、下载、复制、版本记录。
5. MCP：从配置管理升级为工具发现、同步、调用，将 MCP 工具作为工作流节点或上下文工具。
6. 生产工程：完善 health check、GitHub Actions、ARMS 监控，并控制 2C2G ECS 上的内存占用。

## 十一、简历叙事重点

这个项目在简历中可以强调：

- Vue 3 + NestJS 全栈实践。
- 可视化 AI 工作流编排。
- SSE 流式聊天体验。
- RAG 知识库和上下文工程。
- 多模型 Provider 管理。
- Workflow to Skill 的产品化设计。
- MCP 工具生态预留。
- 多用户数据隔离。
- Docker Compose + GitHub Actions + ECS 部署。
- ARMS 前端监控和健康检查。

不要过度强调尚未完全完成的能力。未完成或规划中的能力可以描述为“设计并推进”“预留扩展”“完成基础模型与入口”。

## 十二、重要提醒

- 不要把 NEXUS 当成单纯聊天机器人。
- 不要把 Skill/MCP 写成普通 CRUD。
- 不要为了“像 Dify”照搬复杂架构，应结合当前项目规模逐步演进。
- 不要引入过重依赖。
- 不要破坏现有用户正在修改的文件。
- 不要把生产密钥、服务器 IP、JWT_SECRET 写入文档或代码。
- 修改前先看代码，修改后要验证。

