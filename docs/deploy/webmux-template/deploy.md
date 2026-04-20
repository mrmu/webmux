# Deployment Guide

> This file is read by Claude Code as deployment context.
> Place it at `.webmux/deploy.md` in your project root.

## Hosts

| Environment | Tailscale Host | Path | Notes |
|------------|----------------|------|-------|
| Production | `gcp-prod` | `/home/devops_bot/my-project` | Main server |
| Staging | `gcp-stage` | `/home/devops_bot/my-project` | Testing |

## Deploy Steps

### Staging
```bash
ssh gcp-stage "cd ~/my-project && git pull && docker compose up -d --build"
```

### Production
```bash
ssh gcp-prod "cd ~/my-project && git pull && docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build"
```

## Rollback
```bash
ssh gcp-prod "cd ~/my-project && git checkout HEAD~1 && docker compose up -d --build"
```

## Notes
- Always deploy to staging first
- Check logs after deploy: `ssh gcp-prod "docker logs my-project -f --tail 50"`
