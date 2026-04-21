FROM node:22-alpine AS base

# --- Dependencies ---
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci || npm install

# --- Builder ---
FROM base AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# --- Runner ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# tmux + git + tools (Claude Code runs on host, not in container)
RUN apk add --no-cache openssl tmux git curl bash openssh-client python3 make g++

# Install prod-server runtime deps (ws, node-pty, jsonwebtoken)
RUN npm init -y > /dev/null 2>&1 && \
    npm install --omit=dev ws node-pty@1.0.0 jsonwebtoken 2>/dev/null | tail -1

# Remove build tools after native compile
RUN apk del python3 make g++ 2>/dev/null || true

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Prisma 7 generated client + adapter
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/pg ./node_modules/pg

# Custom production server
COPY --from=builder /app/prod-server.js ./server.js

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
