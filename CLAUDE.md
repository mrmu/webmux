# webmux

AI-Ops development platform — web-based tmux session manager with Claude Code integration.

## Architecture

```
Host (Linux VPS / macOS)
├── tmux server              ← session 持久化，容器重啟不受影響
├── Claude Code CLI          ← 已安裝、已認證 (Max Plan)
├── ~/projects/              ← 所有專案目錄
└── ~/.claude/               ← Claude Code 認證 + 設定

Docker
├── webmux (Next.js)         ← web UI + API，以 host UID 跑
├── PostgreSQL               ← 專案 metadata、用戶帳號、notes
└── wp-proxy network         ← nginx reverse proxy + HTTPS
```

- webmux 是 **web UI only** — 不安裝、不管理 Claude Code
- tmux 和 Claude Code 跑在**宿主機**
- Production 容器以 host user 的 UID 跑，透過 socket mount 連到 host tmux

## Tech Stack

- **Framework**: Next.js 16 (App Router, standalone output)
- **Database**: PostgreSQL via Prisma 7
- **Auth**: Email + password (bcrypt + JWT)
- **Terminal**: xterm.js + WebSocket + node-pty → tmux attach-session (PTY)
- **Chat**: SSE (fs.watch JSONL) + fetch (initial load)
- **UI**: Custom CSS (mobile-first, no framework)

## 本機開發 (macOS)

```bash
# Prerequisites
brew install tmux
npm install -g @anthropic-ai/claude-code

# 啟動 DB + nginx-proxy 轉發
docker compose up -d db dev-proxy

# 啟動 dev server (Next.js + terminal WS)
npm run dev

# 開啟 http://webmux.test
# 首次使用會要求建立 admin 帳號
```

- `npm run dev` 跑兩個進程：Next.js (port 3000) + terminal WebSocket (port 3001)
- `dev-proxy` (socat) 讓 nginx-proxy 把 webmux.test 轉到 host 的 port 3000
- macOS 不走 Docker app container（不能 mount Unix socket）

## Production 部署 (Linux)

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
```

詳見 `docs/deploy/setup.md`

## Commands

```bash
npm run dev          # Dev: Next.js + WS server (host tmux)
npm run build        # Production build (prisma generate + next build)
npm start            # Production server (custom server.ts)
npm run db:push      # Push schema to DB
npm run db:migrate   # Run migrations
```

## Project Structure

```
src/
  app/              # Next.js App Router
    api/            # REST API routes
      auth/         # login, register, logout, password, users
      sessions/     # CRUD, chat, chat-stream (SSE), files, hosts, windows
  components/       # React client components
  lib/              # Server utilities (tmux, auth, validate, parsers)
  generated/        # Prisma client (auto-generated)
prisma/             # DB schema
server.ts           # Dev custom server
ws-server.ts        # WebSocket terminal (shared dev/prod)
ws-dev-server.ts    # Dev: standalone WS server on port 3001
prod-server.js      # Production: standalone Next.js + WS
docs/deploy/        # Deployment guide
```

## DB Schema

- **User**: email (unique), password (bcrypt), name
- **Project**: name, displayName, color, cwd, command, jsonlSessionId
- **Host**: projectName → sshTarget, env (production/staging/development)
- **Note**: sessionName → content (一對多)

## Security

- Session name 驗證: `/^[a-zA-Z0-9_-]+$/`，tmux `-t =name` 強制精確匹配
- CWD 限制在 PROJECTS_ROOT 內
- WebSocket origin allowlist
- Login rate limit (5/min per IP)
- Cookie: httpOnly + sameSite:strict + secure (prod)
- 首個用戶自助註冊，之後只能管理員建帳號
