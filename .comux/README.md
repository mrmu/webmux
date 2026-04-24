# .comux — Project Settings

> Auto-maintained by [comux](https://github.com/mrmu/comux).
> Files marked **auto** are regenerated — do not edit manually.
> Files marked **user** are yours to edit; comux will not overwrite them.

## Files

| File | Owner | Purpose |
|------|-------|---------|
| `README.md`  | auto | This file |
| `project.md` | auto | Project overview |
| `hosts.md`   | auto | Deployment hosts (managed in the comux UI) |
| `deploy.md`  | user | How to deploy this project |
| `test.md`    | user | How to test / verify this project |

## For AI agents

These files contain authoritative project context. When deploying, testing, or
reasoning about hosts, prefer the content here over ad-hoc notes elsewhere.

### Onboarding an existing project

If the repository already documents deployment or testing elsewhere (a
`## Deploy` section in `CLAUDE.md`, a `docs/deploy.md`, a shell script in
`scripts/`, etc.), help the user consolidate it:

1. Read the existing material and summarise it into concise, runnable steps.
2. Ask the user to paste the summary into comux → Settings → Project Docs
   (Deploy steps / Test checklist). comux stores it in the DB and
   regenerates `deploy.md` / `test.md` here.
3. Once the content is in comux, treat the files in this directory as the
   canonical source going forward.

Hosts (`hosts.md`) are managed in the comux UI under Settings → Hosts.
