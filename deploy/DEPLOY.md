# NEXUS 部署指南

## 架构总览

```
┌──────────────────────────────────────────────────┐
│  阿里云 ECS (Ubuntu 22.04, 2C2G + 2G Swap)       │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ Docker Compose                             │  │
│  │  ┌──────────┐  ┌──────────┐                │  │
│  │  │  nginx   │←─│ front/   │ (静态文件挂载) │  │
│  │  │  :80     │  │ dist/    │                │  │
│  │  └────┬─────┘  └──────────┘                │  │
│  │       │ /api/*                             │  │
│  │       ▼                                    │  │
│  │  ┌──────────┐                              │  │
│  │  │  api     │ NestJS :30050                │  │
│  │  └──┬────┬──┘                              │  │
│  │     │    │                                 │  │
│  │     ▼    ▼                                 │  │
│  │ ┌────────┐ ┌────────┐                      │  │
│  │ │postgres│ │ redis  │                      │  │
│  │ │+pgvec  │ │ :6379  │                      │  │
│  │ └────────┘ └────────┘                      │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
        ▲
        │ HTTP :80
        │
   浏览器/外部用户
```

---

## 部署步骤

### 1. 本地构建前端

部署前在本地（Windows）执行：

```bash
cd front
pnpm install
pnpm run build
```

构建产物会输出到 `front/dist/`。

### 2. 上传项目到服务器

在 Windows PowerShell 里：

```powershell
# 在项目根目录 D:\frontend_program\NEXUS 执行
# 用 scp 上传整个项目（排除 node_modules）
scp -r -o StrictHostKeyChecking=no `
  backend-node `
  front/dist `
  deploy `
  docker-compose.yml `
  .env.example `
  root@47.114.89.107:/opt/nexus/
```

或者更推荐的方式：在服务器上 `git clone`，然后只把 `front/dist` 用 scp 上传。

### 3. 服务器上准备环境变量

SSH 连接服务器，进入项目目录：

```bash
cd /opt/nexus
cp .env.example .env
nano .env   # 修改 POSTGRES_PASSWORD 和 JWT_SECRET
```

**生成强 JWT_SECRET：**

```bash
openssl rand -base64 64 | tr -d '\n'
```

把输出粘贴到 `.env` 的 `JWT_SECRET=` 后面。

### 4. 启动所有服务

```bash
cd /opt/nexus
docker compose up -d --build
```

第一次构建需要 5-10 分钟（拉镜像 + 构建后端）。

### 5. 查看服务状态

```bash
docker compose ps
```

应该看到 4 个服务都是 `Up (healthy)` 或 `Up`：
- nexus-postgres
- nexus-redis
- nexus-api
- nexus-nginx

### 6. 查看日志

```bash
# 看后端日志
docker compose logs -f api

# 看 nginx 日志
docker compose logs -f nginx

# 看所有
docker compose logs -f
```

### 7. 浏览器访问

打开 `http://47.114.89.107` 即可看到 NEXUS 登录页。

---

## 常用运维命令

```bash
# 重启某个服务
docker compose restart api

# 重启所有
docker compose restart

# 停止所有
docker compose down

# 更新代码后重新构建后端
docker compose up -d --build api

# 更新前端：本地 build → scp 上传 dist → nginx 自动加载
scp -r front/dist/* root@47.114.89.107:/opt/nexus/front/dist/

# 进入数据库
docker compose exec postgres psql -U nexus -d nexus

# 查看资源占用
docker stats
```

---

## 故障排查

### API 启动失败

查日志：

```bash
docker compose logs api
```

常见原因：
1. **Prisma 迁移失败** - 检查 DATABASE_URL 是否正确
2. **JWT_SECRET 为空** - 检查 .env 是否设置

### 502 Bad Gateway

说明 nginx 找不到后端：

```bash
docker compose ps              # 检查 api 是否 running
docker compose logs api        # 看后端报错
```

### 前端白屏

```bash
# 检查 dist 是否上传成功
ls /opt/nexus/front/dist
# 应该能看到 index.html, assets/ 等
```

### 内存不足

```bash
free -h    # 看 swap 用了多少
docker stats   # 看哪个容器吃内存
```

可以临时降低 PostgreSQL 内存：编辑 `docker-compose.yml`，把 `postgres` 服务的 memory limit 调小。

---

## 升级迁移检查

从 SQLite 切换到 PostgreSQL 后，**原有的 SQLite 数据不会自动迁移**。

第一次启动时会自动创建 PG 数据库结构（通过 `prisma db push`），但是：
- 老的工作流、模板、用户数据需要手动重新创建
- 或者写一个脚本从 `backend-node/prisma/dev.db` 导出再导入 PG

如果你希望保留本地开发数据，告诉我，我可以帮你写迁移脚本。
