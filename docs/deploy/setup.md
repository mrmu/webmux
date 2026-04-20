# WebMux 部署指南

## 架構

```
Linux Host (GCP VM / any VPS)
├── dev user (e.g. devops_bot)
│   ├── tmux server          ← session 持久化
│   ├── claude code CLI       ← Max Plan 登入
│   ├── ~/projects/           ← 所有專案
│   └── ~/.claude/            ← 認證 + 設定
│
└── Docker
    ├── webmux (Next.js)      ← web UI, 用 dev user 的 UID 跑
    ├── postgresql             ← 專案 metadata
    └── wp-proxy network       ← nginx reverse proxy + HTTPS
```

容器用跟宿主機 dev user **同一個 UID** 跑，所以能直接存取 tmux socket 和專案檔案。Claude Code 跑在宿主機上，不在容器裡。

---

## 1. 建立 dev user

```bash
# 建立專用帳號（不用 root 跑 claude）
sudo adduser devops_bot
sudo usermod -aG docker devops_bot

# 記住 UID/GID
id devops_bot
# uid=1002(devops_bot) gid=1003(devops_bot) ...
```

## 2. 安裝宿主機工具

以 dev user 登入：

```bash
su - devops_bot

# tmux
sudo apt install -y tmux

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
# Clone
cd ~
git clone <your-repo-url> webmux
cd webmux

# 設定環境變數
cat > .env << 'EOF'
# Database
POSTGRES_PASSWORD=<generate-a-password>

# WebMux auth（留空 = 不需密碼，靠 Tailscale 網路隔離）
WEBMUX_PASSWORD=
WEBMUX_SECRET=<generate-a-secret>

# Host user（讓容器能存取 tmux socket）
HOST_UID=1002
HOST_GID=1003
HOST_USER_HOME=/home/devops_bot

# Domain
VIRTUAL_HOST=webmux.yoursite.com
LETSENCRYPT_EMAIL=you@example.com
EOF

# 啟動前確保 wp-proxy network 存在
docker network create wp-proxy 2>/dev/null || true

# 啟動
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
```

## 5. 驗證

```bash
# 容器跑起來了？
docker ps | grep webmux

# tmux 能從容器存取？
docker exec webmux tmux list-sessions

# Web UI
curl -s http://localhost:3000/api/auth/check
```

從瀏覽器開 `https://webmux.yoursite.com`，建立專案，Terminal tab 裡打 `claude`，應該直接用宿主機已登入的 Claude Code。

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

## macOS 本機開發

本機不走 Docker，直接跑 Next.js dev server：

```bash
cd ~/next/webmux

# 確保宿主機有 tmux 和 Claude Code
brew install tmux
npm install -g @anthropic-ai/claude-code

# 啟動 dev server（直接用宿主機 tmux + claude）
npm run dev

# 開啟 http://webmux.test
```

需要 PostgreSQL（可用 Docker 單獨跑或本機安裝）：
```bash
# 只啟動 DB
docker compose up -d db
```
