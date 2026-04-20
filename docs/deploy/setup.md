# WebMux 部署指南

## 架構

```
Linux Host (VPS)
├── dev user (e.g. devops)
│   ├── tmux server          ← session 持久化
│   ├── Claude Code CLI      ← Max Plan 登入
│   ├── ~/projects/          ← 所有專案
│   └── ~/.claude/           ← 認證 + 設定
│
└── Docker
    ├── webmux (Next.js)     ← web UI, 用 dev user 的 UID 跑
    ├── PostgreSQL           ← 專案 metadata + 用戶帳號
    └── wp-proxy network     ← nginx reverse proxy + HTTPS
```

容器用跟宿主機 dev user **同一個 UID** 跑，透過 socket mount 連到 host tmux。
Claude Code 跑在宿主機上，不在容器裡。

---

## 1. 建立 dev user

```bash
sudo adduser devops
sudo usermod -aG docker devops

# 記住 UID/GID
id devops
# uid=1001(devops) gid=1001(devops) ...
```

## 2. 安裝宿主機工具

以 dev user 登入：

```bash
su - devops

# Node.js (for Claude Code)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# tmux
sudo apt install -y tmux git

# Claude Code
npm install -g @anthropic-ai/claude-code

# 首次登入（Max Plan OAuth）
claude
# 完成瀏覽器認證流程

# 確認
claude --version
tmux -V
```

## 3. 設定 Tailscale（選用）

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

## 4. 部署 WebMux

```bash
cd ~
git clone <your-repo-url> webmux
cd webmux

# 設定環境變數
cat > .env << EOF
# Database
POSTGRES_PASSWORD=$(openssl rand -hex 16)

# Auth JWT secret
WEBMUX_SECRET=$(openssl rand -hex 32)

# Host user（讓容器能存取 tmux socket）
HOST_UID=$(id -u)
HOST_GID=$(id -g)
HOST_USER_HOME=$HOME

# Domain
VIRTUAL_HOST=webmux.yoursite.com
LETSENCRYPT_EMAIL=you@example.com
EOF

# 啟動前確保 wp-proxy network 存在
docker network create wp-proxy 2>/dev/null || true

# 啟動
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
```

## 5. 首次設定

1. 開瀏覽器 → `https://webmux.yoursite.com`
2. 建立 admin 帳號（email + 密碼）
3. 建立第一個專案 → Terminal tab → 輸入 `claude`
4. Claude Code 會使用宿主機已登入的認證

## 6. 驗證

```bash
# 容器運行中？
docker ps | grep webmux

# API 正常？
curl -s http://localhost:3000/api/auth/check

# tmux 可存取？
docker exec webmux tmux list-sessions
```

---

## 常用操作

```bash
# 更新 webmux
cd ~/webmux && git pull
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build

# 查看 logs
docker logs webmux -f

# tmux session 不受容器重啟影響（跑在宿主機）
tmux list-sessions
tmux attach -t <project-name>
```

---

## macOS 本機開發

本機不走 Docker app container，直接跑 dev server：

```bash
cd ~/next/webmux

# Prerequisites
brew install tmux
npm install -g @anthropic-ai/claude-code

# 啟動 DB + nginx-proxy 轉發
docker compose up -d db dev-proxy

# 啟動 dev server
npm run dev

# 開啟 http://webmux.test
```

`npm run dev` 跑兩個進程：
- Next.js (port 3000) — 頁面 + API + HMR
- Terminal WebSocket (port 3001) — PTY → tmux

`dev-proxy` (socat container) 讓 nginx-proxy 把 `webmux.test` 轉到 host port 3000。
