# NEXUS 部署执行清单

> 已完成：服务器购买、Docker 安装、Swap 配置、本地代码改造、前端构建（`front/dist` 已生成）
>
> 剩余：上传代码、启动服务、验证访问

---

## 当前阶段总览

```
[完成] 1. 阿里云 ECS 购买（华北2，2C2G，Ubuntu 22.04）
[完成] 2. SSH 连接服务器（root@47.114.89.107）
[完成] 3. 安装 Docker + Docker Compose
[完成] 4. 配置 2G Swap
[完成] 5. 本地代码改造
        - Prisma schema: SQLite → PostgreSQL
        - 后端 Dockerfile + .dockerignore
        - 前端 .env.production 改为 /api
        - Nginx 反向代理配置
        - docker-compose.yml 编排 4 个服务
[完成] 6. 本地构建前端（front/dist 已生成）
[进行] 7. 上传代码到服务器
[待办] 8. 服务器准备环境变量
[待办] 9. docker compose up 启动
[待办] 10. 浏览器访问验证
[待办] 11. 数据迁移（可选，如需保留本地 SQLite 数据）
```

---

## 第 7 步：上传代码到服务器

### 7.1 服务器创建目录

> 目的：在 ECS 上准备好接收代码的位置，统一放在 `/opt/nexus`，符合 Linux 服务部署惯例

**在 SSH 终端执行**：

```bash
mkdir -p /opt/nexus
```

### 7.2 本地用 scp 上传

> 目的：把前端构建产物 + 后端源码 + 部署配置打包传到服务器；不上传 node_modules（服务器构建时会重新装）

**在 Windows PowerShell 中（项目根目录 D:\frontend_program\NEXUS）执行**：

```powershell
scp -r `
  backend-node `
  front/dist `
  deploy `
  docker-compose.yml `
  .env.example `
  root@47.114.89.107:/opt/nexus/
```

**关键点**：

- `backend-node` 整个目录上传（含 Dockerfile、prisma、src、package.json）
- `front/dist` 只上传构建产物（不传源码，nginx 只需要静态文件）
- `deploy/` 包含 nginx.conf
- `docker-compose.yml` + `.env.example` 在根目录

**预期耗时**：3-5 分钟（取决于本地上行带宽和 ECS 下行带宽）

### 7.3 验证上传

**在 SSH 终端执行**：

```bash
ls -lh /opt/nexus
```

应该看到：

```
backend-node/
deploy/
docker-compose.yml
.env.example
front/
```

---

## 第 8 步：服务器准备环境变量

### 8.1 复制环境变量模板

```bash
cd /opt/nexus
cp .env.example .env
```

### 8.2 生成强 JWT Secret

> 目的：JWT 默认 secret 是 `default-secret`，生产环境必须换成不可猜测的随机字符串，否则别人能伪造你的 token

```bash
openssl rand -base64 64 | tr -d '\n'
```

复制输出的 64 位随机字符串。

### 8.3 编辑 .env 文件

```bash
nano /opt/nexus/.env
```

修改两个值：

```env
POSTGRES_PASSWORD=改成你自己的强密码（如 NexusPg2026!Strong#）
JWT_SECRET=粘贴刚才生成的 64 位随机字符串
```

> nano 操作：`Ctrl+O` 保存，回车确认，`Ctrl+X` 退出

---

## 第 9 步：启动所有服务

### 9.1 一键构建 + 启动

```bash
cd /opt/nexus
docker compose up -d --build
```

> `-d` 后台运行，`--build` 强制重新构建后端镜像
>
> 第一次需要 5-10 分钟（拉镜像 + 装 Node 依赖 + 构建后端）

### 9.2 实时查看构建进度

如果想看构建过程，**另开一个 SSH 窗口**执行：

```bash
docker compose -f /opt/nexus/docker-compose.yml logs -f
```

`Ctrl+C` 退出日志查看（不会停服务）。

### 9.3 验证服务状态

```bash
docker compose -f /opt/nexus/docker-compose.yml ps
```

期望看到 4 个服务都是 `Up` 或 `Up (healthy)`：

| 服务名 | 状态 | 端口 |
|--------|------|------|
| nexus-postgres | Up (healthy) | 仅内部 |
| nexus-redis | Up (healthy) | 仅内部 |
| nexus-api | Up | 仅内部 30050 |
| nexus-nginx | Up | 0.0.0.0:80 |

---

## 第 10 步：浏览器访问验证

### 10.1 访问前端

浏览器打开：

```
http://47.114.89.107
```

应该看到 NEXUS 登录页。

### 10.2 测试 API

打开浏览器开发者工具（F12）→ Network 面板，尝试登录或注册操作，检查 `/api/UserAccount/login` 等请求：

- ✅ 状态 200 + 正常返回 JSON
- ❌ 状态 502：nginx 找不到后端 → 查 `docker compose logs api`
- ❌ 状态 404：URL 拼错 → 检查 nginx.conf 的 location /api/ 配置

### 10.3 常见问题排查

**问题 1：浏览器白屏**

```bash
# 检查前端文件是否在容器内
docker compose exec nginx ls /usr/share/nginx/html
# 应该能看到 index.html
```

**问题 2：API 502**

```bash
# 看后端日志
docker compose logs --tail 100 api
```

常见原因：
- Prisma 迁移失败（DATABASE_URL 配错）
- JWT_SECRET 为空
- 内存不够（看 `docker stats`）

**问题 3：数据库连接失败**

```bash
# 进入 postgres 容器测试
docker compose exec postgres psql -U nexus -d nexus -c "SELECT 1;"
```

---

## 第 11 步（可选）：数据迁移

如果想保留本地开发的工作流、模板、用户数据：

### 11.1 本地导出 SQLite 数据

```bash
cd D:\frontend_program\NEXUS\backend-node
sqlite3 prisma/dev.db ".dump" > nexus-local-dump.sql
```

### 11.2 转换 SQL 语法

SQLite 和 PostgreSQL 语法有差异，主要差异：
- `INSERT INTO "table"` → 列名要加双引号
- `BEGIN TRANSACTION;` → `BEGIN;`
- 不支持 `PRAGMA` 等指令

> 数据量小时，更简单的做法是：手动在前端重新创建几个工作流和模板。

如果数据量大，告诉我，我可以写一个迁移脚本帮你转换。

---

## 后续运维常用命令

```bash
# 重启某个服务
docker compose restart api

# 看实时日志
docker compose logs -f api

# 更新代码后重新构建
docker compose up -d --build api

# 更新前端：本地 build → scp 上传
scp -r front/dist/* root@47.114.89.107:/opt/nexus/front/dist/

# 看资源占用
docker stats

# 进入数据库
docker compose exec postgres psql -U nexus -d nexus

# 完全停止
docker compose down

# 完全停止 + 删数据卷（谨慎，会删数据库！）
docker compose down -v
```

---

## 路线图（部署上线后的工作）

| 阶段 | 内容 | 预计周期 |
|------|------|---------|
| ✅ P1 | 数据库 + Redis + 环境变量规范化 | 完成 |
| ✅ P2 | Docker Compose + Nginx + 部署上线 | 完成 |
| P3 | 多用户数据隔离（业务表加 userId） | 3-5 天 |
| P4 | 工作流引擎升级（拓扑调度 + VariablePool） | 2-3 周 |
| P5 | RAG 增强（pgvector 检索 + Rerank） | 1 周 |
| P6 | Skill 炼化（工作流发布为可复用 Skill） | 2 周 |
| P7 | MCP 接入（McpToolNode + MCP Server 管理） | 1-2 周 |
