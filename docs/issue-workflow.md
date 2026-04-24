# Issue Workflow 設計

本文記錄 comux Issue tracker 的目標工作流（Phase 2），尚未全部實作完成。
Phase 1 已完成的部分見 `prisma/schema.prisma` 的 `Issue` / `IssueEvent` model。

最後更新：2026-04-22

---

## 1. 角色

| 角色 | 說明 | 可由誰擔任 |
|---|---|---|
| **PM** (泛科 PM) | 收集需求、寫成工程師看得懂的文件、stage 驗收、審核上正式 | 真人 或 AI |
| **Dev** | 實際寫碼、跑測試、修漏洞、發 PR | 真人 或 AI (Claude) |

合併註：原流程中的「泛科 PM」與「潮網 PM」現已整併為單一 PM 角色。
VN PM / VN Dev 的翻譯與排程環節取消 — AI 化版本由 AI 直接承接。

---

## 2. 狀態機

DB 存英文 enum（穩定、跨系統好處理），UI / 稽核報告顯示中文 label。

| DB enum | UI 顯示 | 進入條件 / 設定者 | 這個狀態下在做什麼 |
|---|---|---|---|
| `GATHERING_REQUIREMENTS` | 需求確認中 | PM 收到新需求 | PM（或 AI）與提需求者釐清細節 |
| `READY_TO_SCHEDULE` | 待排程 | PM 寫完需求文件 + 驗收條件 | 等 Dev 接手 |
| `IN_DEVELOPMENT` | 排程中 | Dev 接手開始寫碼 | 寫碼、跑單元測試、跑 Semgrep |
| `AWAITING_STAGE_TEST` | 待測試（stage） | Dev 宣告完工 + 自動化測試 + Semgrep 通過 + PR 已合入 develop | PM 在 stage 環境手動驗收 |
| `APPROVED_FOR_PROD` | 待上正式 | PM stage 測試通過 | 等自動部署（或批次）上 main |
| `TEST_FAILED` | 測試失敗待排程 | PM stage 驗證不過 | 退回 Dev 重做，含 PM 寫的失敗說明 |
| `DONE` | 已完成 | 已部署到 prod + PM 確認 | 結案，留存稽核紀錄 |

### 狀態轉移圖

```
GATHERING_REQUIREMENTS → READY_TO_SCHEDULE → IN_DEVELOPMENT → AWAITING_STAGE_TEST
                                                  ↑                   │
                                                  │                   ├→ APPROVED_FOR_PROD → DONE
                                                  │                   │
                                                  └──── TEST_FAILED ←─┘
```

---

## 3. Git 策略

### Branch 角色

| Branch | 用途 | 部署目標 |
|---|---|---|
| `main` | Production-ready | 自動部署 prod |
| `develop` | 持續整合、stage 環境 | 自動部署 stage |
| `feat/<issue-id>-<slug>` | 每個 Issue 的 feature branch | 不直接部署 |
| `hotfix/<issue-id>-<slug>` | 緊急上 prod 的修復 | 走加速通道 |

### 流程

1. Issue 進 `IN_DEVELOPMENT` → Dev 從 `develop` 切 `feat/<id>-<slug>`
2. Dev 寫碼 + 自動化測試 + Semgrep 通過 → 開 PR 目標 `develop`
3. PR merge → CI 自動 deploy stage → Issue 轉 `AWAITING_STAGE_TEST`
4. PM 在 stage 驗收通過 → Issue 轉 `APPROVED_FOR_PROD` → 系統自動開 PR `develop → main`
5. `develop → main` merge → CI 自動 deploy prod → Issue 轉 `DONE`
6. Hotfix：從 `main` 切 `hotfix/*`，測試通過後 PR 同時合到 `main` 和 `develop`（避免 drift）

### 原流程「develop 應該也要 merge release」的處理

原問題：cherry-pick 上正式 → develop 和 release 會不一致。
解法：**不 cherry-pick**。改成整個 develop → main，所以無 drift。
若 feature A 通過 B 沒通過、只想上 A：
- 最乾淨：暫時 revert B 在 develop，上 A，再把 B reset 回去
- 較快但有風險：直接 merge `feat/A` 到 main，繞過 develop；事後 develop 要 rebase main

---

## 4. AI 介入點

### PM = AI

| 狀態轉移 | AI 做什麼 |
|---|---|
| 使用者丟簡短需求 → `GATHERING_REQUIREMENTS` | AI 讀 repo code 提問釐清，與使用者互動 |
| `GATHERING_REQUIREMENTS` → `READY_TO_SCHEDULE` | AI 把短描述擴寫為完整 spec + 驗收條件 |
| `AWAITING_STAGE_TEST` → `APPROVED_FOR_PROD` | 若 AI 擔任 PM：照驗收條件自動測 stage（E2E）|

### Dev = AI (Claude)

| 狀態轉移 | AI 做什麼 |
|---|---|
| `READY_TO_SCHEDULE` → `IN_DEVELOPMENT` | Spawn tmux session、clone feature branch、讀 spec |
| `IN_DEVELOPMENT` 持續中 | 寫碼、互動問答（在 Issue 詳情頁內嵌 chat）、必要時 cue PM |
| `IN_DEVELOPMENT` → `AWAITING_STAGE_TEST` | 跑 test suite + Semgrep，全過才能轉，失敗就留 `IN_DEVELOPMENT` 並在 Issue 評論貼出錯誤 |

### 互動 UI

Claude 執行中需要問使用者時，在 Issue 詳情頁**內嵌一個輕量 chat 面板**（reuse
`ChatView.tsx`，綁 Issue.sessionName）。不要跳到別的頁面，保持「一張工單一個對話」。

---

## 5. 測試策略

### 分層

1. **驗收條件（AC）** — Issue 進 `READY_TO_SCHEDULE` 時必須寫好，條列。由 PM 寫或 AI 草擬 PM 審。
2. **自動化測試** — Dev（AI 或人）依 AC 寫，可能是 unit / integration / E2E。放在對應 feature branch。
3. **Semgrep 弱掃** — 每次 push 到 feature branch 自動跑；HIGH/CRITICAL 會 block 進 develop。

### 建議：AC-Driven Development

AI Dev 的實作順序：
1. 讀 spec + AC
2. **先寫測試**（unit 測 happy path、edge case；E2E 覆蓋 AC）
3. 測試跑起來是 red
4. 寫實作讓測試變 green
5. refactor
6. 跑 Semgrep
7. 開 PR

這樣稽核員問「你怎麼驗證符合需求」時，答案就是「AC → test case → test run log」的清楚鏈條。

### Semgrep 門檻

| Severity | 處置 |
|---|---|
| CRITICAL / HIGH | 自動 block，不讓轉 `AWAITING_STAGE_TEST` |
| MEDIUM | 警告，留紀錄但放行；要 PM 或 Dev 標記 risk accepted |
| LOW / INFO | 只記錄 |

---

## 6. Jira 單向同步（之後才做）

- 需要 Jira API token + Jira workspace URL（等使用者提供）
- 手動按鈕觸發（不定期輪詢）：「Sync from Jira」
- 拉 Jira issue → 建 comux Issue，欄位：
  - `source = EXTERNAL_SYNC`
  - `sourceRef = <Jira Key>`（e.g. `MV-123`）
  - `title` / `body` / `severity` 從 Jira 映射
- comux 對這些 Issue 是唯讀（不反向寫回 Jira）

---

## 7. 其他決策

### 中文化方式

- **DB 層**：英文 enum 不變（OPEN / IN_PROGRESS / FIXED / WONT_FIX / FALSE_POSITIVE / RISK_ACCEPTED 等）
- **UI 層**：`src/lib/issues.ts` 新增 `STATUS_LABELS`、`SEVERITY_LABELS` map，render 時查表
- **匯出層**：稽核報告 CSV / PDF 依稽核員偏好，預設中文
- 理由：DB 存中文對 SQL 查詢、FK 比對、第三方工具整合都是地雷

### 不做 @mention 通知

- 目前 comux 是單人使用，先略過
- 未來多人時再考慮：站內通知 / email / Slack webhook

---

## 8. Open questions（待實作前再決定）

- feature branch merge 到 develop 用 merge commit (`--no-ff`) 還是 squash？
- stage 環境怎麼部署？現有 CI？ 還是 comux 自己 SSH 部署？
- `TEST_FAILED` → `IN_DEVELOPMENT` 轉回來，要不要同時 revert 那次部署到 stage 的 commit？
- 一個 Issue 一個 tmux session，session 名字怎麼取？`issue-<id>`？
- PM = AI 時，「stage 驗收」要 AI 會看網站 / 跑 E2E？還是 PM 一定是真人？

---

## 9. 目前 Phase 1 已有什麼

- Issue + IssueEvent table（含軟刪、稽核欄位）
- CRUD API + 列表 / 詳情 / 建立 UI
- 關閉時強制 resolutionType + ref/note（稽核紅線）
- 跨專案列表 + 可依 project / status / severity 過濾
- 從專案頁一鍵跳到該專案的 issues（`/issues?project=<name>`）

## 10. 要擴充什麼

- [ ] 新增 6 個 status enum（`GATHERING_REQUIREMENTS` 等）— 擴充而非取代現有 `OPEN` 等通用狀態
- [ ] STATUS_LABELS / SEVERITY_LABELS 中文化表
- [ ] Issue 詳情頁內嵌 ChatView（綁 `sessionName`）
- [ ] 「指派給 Claude」按鈕：建 feature branch + spawn tmux session + 下指令
- [ ] PR 狀態回寫 Issue（用 `gh pr view` 查狀態）
- [ ] AC 欄位（結構化 checklist）
- [ ] Jira 單向 sync（等 API token）
- [ ] Semgrep 結果 → 自動建 Issue (`source=SCAN`)
