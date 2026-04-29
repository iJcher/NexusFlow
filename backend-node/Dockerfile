# ============================================
# Stage 1: 构建阶段
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# 配置国内源加速：Alpine apk 使用中科大源，npm/pnpm 使用 npmmirror
RUN sed -i 's#https://dl-cdn.alpinelinux.org/alpine#https://mirrors.ustc.edu.cn/alpine#g' /etc/apk/repositories && \
    npm config set registry https://registry.npmmirror.com && \
    npm install -g pnpm && \
    pnpm config set registry https://registry.npmmirror.com

# 先拷贝依赖清单，利用 Docker 层缓存
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma

# 安装所有依赖（含 devDependencies，构建需要）
RUN pnpm install --frozen-lockfile || pnpm install

# 生成 Prisma Client
RUN npx prisma generate

# 拷贝源码并构建
COPY . .
RUN pnpm run build

# 移除 devDependencies，减小体积
RUN pnpm prune --prod

# ============================================
# Stage 2: 运行阶段
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# 安装运行时依赖。Alpine apk 使用中科大源，避免国内构建时下载过慢。
RUN sed -i 's#https://dl-cdn.alpinelinux.org/alpine#https://mirrors.ustc.edu.cn/alpine#g' /etc/apk/repositories && \
    apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=30050

# 从构建阶段拷贝产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

EXPOSE 30050

# 启动前先跑数据库迁移，再启动服务
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/main"]
