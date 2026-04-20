# webmux

AI-Ops development platform — web-based tmux session manager with Claude Code integration.

## Architecture

- webmux is a **web UI only** — it does NOT install or manage Claude Code
- tmux and Claude Code run on the **host machine**, already installed and authenticated
- Docker container only runs Next.js + PostgreSQL
- Production: container runs as host UID, connects to host tmux via socket mount

## 本機開發

```bash
# Prerequisites: tmux, Claude Code, PostgreSQL
npm run dev          # 直接跑在宿主機，用宿主機的 tmux + claude
docker compose up -d db   # 只跑 DB
```

域名：webmux.test（/etc/hosts 設定），不要用 localhost:3000

每次修改都要先測試，前後端都要，然後確認功能正常。
本機開發不走 Docker（macOS 不能 mount Unix socket）。

## Tech Stack

- **Framework**: Next.js (App Router, standalone output)
- **Database**: PostgreSQL via Prisma 7
- **Terminal**: xterm.js + WebSocket + node-pty (PTY to tmux attach-session)
- **UI**: Custom CSS (mobile-first)

## Commands

```bash
npm run dev          # Dev server (host tmux)
npm run build        # Production build
npm start            # Production server
npm run db:push      # Push schema to database
```
