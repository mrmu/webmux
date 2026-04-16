# webmux

AI-Ops development platform — web-based tmux session manager with Claude Code integration.

## Tech Stack

- **Framework**: Next.js 16 (App Router, standalone output)
- **Database**: PostgreSQL 16 via Prisma 7
- **Terminal**: xterm.js + WebSocket (custom server)
- **UI**: Custom CSS (mobile-first, no Tailwind utility classes)
- **Deploy**: Docker multi-stage build, wp-proxy network

## Project Structure

```
src/
  app/           # Next.js App Router (pages + API routes)
  components/    # React client components
  lib/           # Server-side utilities (tmux, parser, file-manager)
  generated/     # Prisma client (auto-generated, do not edit)
prisma/          # Database schema
server.ts        # Dev server (Next.js + WebSocket)
ws-server.ts     # WebSocket logic (shared)
prod-server.js   # Production server (standalone + WebSocket)
docs/            # PRD and deployment docs
refs/            # Reference codebases (not tracked in git)
```

## Commands

```bash
npm run dev          # Dev server with WebSocket (via tsx)
npm run build        # Production build (prisma generate + next build)
npm start            # Production server
npm run db:push      # Push schema to database
npm run db:migrate   # Run migrations
```

## Docker

```bash
docker compose up -d          # Start all services
docker compose up -d --build  # Rebuild and start
```

Domain: `webmux.test` (via wp-proxy VIRTUAL_HOST)

## Key Design Decisions

- **Standalone + custom server**: `output: "standalone"` for small Docker image; `prod-server.js` replaces default `server.js` to add WebSocket
- **Polling terminal**: tmux capture-pane at 100ms via WebSocket (not PTY — works across containers)
- **Client-side SPA**: Single page managing login/list/workspace screens
- **Mobile-first CSS**: safe-area-inset, horizontal scroll tabs, touch-optimized
