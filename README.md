# webmux

Web-based tmux session manager for Claude Code. Manage multiple AI-assisted development projects from your phone or desktop browser.

## What it does

- **Terminal** — xterm.js connected to host tmux via PTY (real terminal)
- **Chat** — Claude Code conversations (JSONL parsing, SSE live push)
- **Files** — Browse and edit project files
- **Projects** — Each project = one tmux session with multiple windows
- **Hosts** — Track deployment targets (SSH/Tailscale machines) per project
- **DNS** — Manage Cloudflare DNS records
- **Auth** — Email/password accounts (bcrypt + JWT), admin-only registration

## Architecture

```
Browser → nginx-proxy (HTTPS) → Docker (Next.js + PostgreSQL)
                                     ↕ tmux socket mount
                                Host: tmux + Claude Code (your account)
```

webmux is a **web UI only**. It does NOT install or run Claude Code — that runs on the host with your own authentication.

## Quick Start

### Production (Linux VPS)

```bash
# Prerequisites: Docker, tmux, Claude Code (authenticated), Node.js
git clone git@github.com:mrmu/webmux.git ~/webmux && cd ~/webmux

# Configure
cp .env.example .env  # edit: HOST_UID, VIRTUAL_HOST, secrets

# Deploy
docker network create wp-proxy 2>/dev/null || true
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build

# Open https://your-domain.com → first-time setup (admin account + projects directory)
```

### Update

```bash
cd ~/webmux && git pull
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
```

### Local Dev (macOS)

```bash
docker compose up -d db dev-proxy   # DB + nginx-proxy bridge
npm run dev                         # http://webmux.test
```

## Key Files

| File | Purpose |
|------|---------|
| `prod-server.js` | Production: Next.js standalone + WebSocket |
| `ws-server.ts` | Terminal WebSocket (PTY → tmux attach) |
| `src/lib/tmux.ts` | tmux command adapter |
| `src/lib/cloudflare.ts` | Cloudflare DNS API |
| `src/lib/auth.ts` | Email/password auth (bcrypt + JWT) |
| `src/lib/settings.ts` | DB-backed settings (projects root, etc.) |
| `docs/deploy/setup.md` | Full deployment guide |
