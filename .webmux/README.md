# .webmux — Project Settings

> Auto-maintained by [webmux](https://github.com/mrmu/webmux).
> Files marked **auto** are regenerated — do not edit manually.
> Files marked **user** are yours to edit; webmux will not overwrite them.

## Files

| File | Owner | Purpose |
|------|-------|---------|
| `README.md`  | auto | This file |
| `project.md` | auto | Project overview |
| `hosts.md`   | auto | Deployment hosts (managed in the webmux UI) |
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
2. Ask the user to paste the summary into webmux → Settings → Project Docs
   (Deploy steps / Test checklist). webmux stores it in the DB and
   regenerates `deploy.md` / `test.md` here.
3. Once the content is in webmux, treat the files in this directory as the
   canonical source going forward.

Hosts (`hosts.md`) are managed in the webmux UI under Settings → Hosts.
