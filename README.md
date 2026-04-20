# webmux

Web-based tmux session manager for Claude Code. Manage multiple AI-assisted development projects from your phone or desktop browser.

## What it does

- **Terminal** — xterm.js connected to host tmux via PTY (real terminal, not capture-pane)
- **Chat** — Read Claude Code conversations (parsed from JSONL, pushed via SSE)
- **Files** — Browse and edit project files
- **Projects** — Each project = one tmux session with multiple windows
- **Hosts** — Track deployment targets (SSH/Tailscale machines) per project
- **DNS** — Manage Cloudflare DNS records for `*.your-domain.com`

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
git clone <repo> ~/webmux && cd ~/webmux

# Configure
cp .env.example .env  # edit: HOST_UID, VIRTUAL_HOST, secrets

# Deploy
docker network create wp-proxy 2>/dev/null || true
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build

# Open https://your-domain.com → create admin account
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
| `docs/deploy/setup.md` | Full deployment guide |
