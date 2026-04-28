## 一、阿里云 ECS 选购

> 目标：以最低成本跑起来，先验证产品形态，后续按需升配

### 实例配置

| 项目 | 选择 | 说明 |
|------|------|------|
| 地域 | 华北 2（北京） | 国内访问延迟低 |
| 实例规格 | ecs.e-c1m1.large（2 核 2G 经济型 e） | 99 元/年活动机，开发期够用 |
| 镜像 | Ubuntu 22.04 LTS 64 位 | Docker 生态最成熟，搜索资料最多 |
| 系统盘 | ESSD Entry 40 GiB | 系统 + 数据库 + 上传文件够用 |
| 网络 | 专有网络 + 默认交换机 | 阿里云默认配置即可 |
| 带宽 | 按固定带宽 3 Mbps | 比按量付费更省钱 |
| 购买时长 | 1 年 | 包年比按月便宜 50% 以上 |

### 安全组配置

ECS 控制台 → 安全组 → 入方向，必须放行：

- **22**（SSH 远程登录）
- **80**（HTTP 网站访问）
- **443**（HTTPS，将来挂域名 + SSL 用）

## 二、ECS 初始化

### 重置实例密码

> 踩坑：自定义登录名（如 Jcher）会失败，因为 Linux 系统中没有这个用户。**必须用 root**。

操作路径：ECS 控制台 → 实例 → 更多 → 密码/密钥 → 重置实例密码

- **登录名**：`root`
- **密码**：8-30 位，含大小写字母 + 数字（建议加特殊符号）
- **重置方式**：在线重置密码（无需重启即可生效）
- **配置 SSH 密码登录策略**：开启

### 添加 Swap 虚拟内存

> 关键：2G 内存的机器跑 Docker + PG + Redis + NestJS + Nginx 会很紧张，Swap 用来兜底防 OOM

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

验证：

```bash
free -h
```

应该看到 `Swap: 2.0Gi`。

## 三、SSH 连接服务器

在 Windows PowerShell 里执行：

```bash
ssh root@47.114.89.107
```

> 粘贴技巧：PowerShell 的 SSH 终端里，**鼠标右键单击**就是粘贴，不要用 Ctrl+V

第一次连接会问 `Are you sure you want to continue connecting (yes/no)?`，输入 `yes`。

## 四、安装 Docker 环境

### 更新系统包

```bash
apt update && apt upgrade -y && apt install -y curl git
```

> 升级过程中会弹出 `Daemons using outdated libraries` 蓝色界面，按 Tab 选 `<Ok>` 回车即可

### 一键安装 Docker

```bash
curl -fsSL https://get.docker.com | sh
```

> 2 核 2G + 3M 带宽，需要等 3-5 分钟。终端没出现新提示符就还在装，不要打断

### 验证版本

```bash
docker --version && docker compose version
```

应该输出：

- `Docker version 29.x.x`
- `Docker Compose version v2.x.x`

## 五、本地代码改造

### 改造清单

| 文件 | 改动内容 |
|------|---------|
| `backend-node/prisma/schema.prisma` | datasource 从 sqlite 改为 postgresql |
| `backend-node/.env.example` | 后端环境变量模板 |
| `backend-node/Dockerfile` | 后端容器构建配置（Node 20 多阶段构建） |
| `backend-node/.dockerignore` | 排除 node_modules 等 |
| `front/.env.production` | API 地址从 `http://localhost:30050` 改为 `/api`（走 nginx 反代） |
| `deploy/nginx.conf` | Nginx 反向代理配置（含 SSE 流式支持） |
| `docker-compose.yml` | 编排 4 个服务：postgres / redis / api / nginx |
| `.env.example` | Docker Compose 环境变量模板 |
| `deploy/DEPLOY.md` | 完整部署说明文档 |

### 架构图

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
```

### 关键技术决策

**为什么选 PostgreSQL + pgvector：**

- PG 是 NestJS / Prisma 生态最成熟的生产数据库
- pgvector 扩展让数据库本身就支持向量检索，不需要额外部署 Milvus / Qdrant
- 一个数据库同时解决业务数据 + RAG 向量检索，运维简单
- Dify 等成熟产品也是这个组合

**为什么前端 API 地址改为 `/api`：**

- 浏览器走 nginx 反代到后端，避免跨域问题
- 同源访问，将来挂域名 + HTTPS 不用改代码
- 切换服务器 IP 不需要重新构建前端

## 六、待执行步骤

### 1. 本地构建前端

```bash
cd D:\frontend_program\NEXUS\front
pnpm run build
```

输出到 `front/dist/` 目录。

### 2. 上传项目到服务器

```bash
scp -r backend-node front/dist deploy docker-compose.yml .env.example root@47.114.89.107:/opt/nexus/
```

### 3. 服务器准备环境变量

```bash
cd /opt/nexus
cp .env.example .env
nano .env  # 修改 POSTGRES_PASSWORD 和 JWT_SECRET
```

生成强 JWT_SECRET：

```bash
openssl rand -base64 64 | tr -d '\n'
```

### 4. 启动服务

```bash
docker compose up -d --build
```

第一次需要 5-10 分钟（拉镜像 + 构建后端）。

### 5. 验证

```bash
docker compose ps  # 4 个服务都应该是 Up (healthy)
docker compose logs -f api  # 看后端日志
```

浏览器打开 `http://47.114.89.107` 即可访问。

## 七、踩坑记录

| 问题 | 原因 | 解决 |
|------|------|------|
| `Permission denied (publickey)` | 默认只开了 SSH 密钥登录 | 控制台开启密码登录策略 |
| 重置密码失败 `pam_chauthtok() failed` | 自定义登录名不存在 | 改回 root 用户 |
| 终端粘贴 Ctrl+V 无效 | PowerShell SSH 用右键粘贴 | 鼠标右键单击 |
| `apt update` 后弹蓝色界面 | systemd 服务重启确认 | Tab 选 Ok 回车 |
| 看不到安装进度 | 命令占用终端 | 开第二个 SSH 窗口跑 `ps aux \| grep apt` |

## 八、后续规划（按优先级）

| 阶段 | 内容 | 预计周期 |
|------|------|---------|
| P3 | 多用户数据隔离（业务表加 userId） | 3-5 天 |
| P4 | 工作流引擎升级（拓扑调度 + VariablePool + 持久化） | 2-3 周 |
| P5 | RAG 增强（pgvector 检索 + Rerank） | 1 周 |
| P6 | Skill 炼化（工作流发布为可复用 Skill） | 2 周 |
| P7 | MCP 接入（McpToolNode + MCP Server 管理） | 1-2 周 |
