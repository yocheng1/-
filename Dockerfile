# ---------------------------------------------------------------- 安裝相依
# 用 Debian slim 而不是 Alpine：better-sqlite3 是原生模組，
# Debian (glibc) 有現成的預編譯檔，Alpine (musl) 得從原始碼編譯。
FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------- 建置
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------- 執行
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/data/kplus.db

# 不要用 root 跑服務
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 應用程式啟動時會讀這個檔案建表，一定要一起打包進來
COPY --from=builder --chown=nextjs:nodejs /app/db ./db

# 資料庫掛在 volume，容器重建資料才不會消失
RUN mkdir -p /data && chown nextjs:nodejs /data
VOLUME ["/data"]

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
