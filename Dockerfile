FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=2048
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_AUTH_REDIRECT_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_AUTH_REDIRECT_URL=$NEXT_PUBLIC_AUTH_REDIRECT_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# 合集封面由 sharp + librsvg 在服务端排版出图，中文字形必须来自系统字体。
# 官方 slim 镜像不带任何 CJK 字体，缺失时所有中文都会渲染成方块，
# 所以在运行镜像里显式安装 Noto Sans CJK（同时提供 Regular 与 Bold 两档字重）。
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-noto-cjk fontconfig \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/scripts/ai-task-worker.mjs ./scripts/ai-task-worker.mjs
COPY --from=builder /app/scripts/metrics-agent.mjs ./scripts/metrics-agent.mjs
EXPOSE 3000
CMD ["node", "server.js"]
