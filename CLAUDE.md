# homelab — project instructions

Read this before doing anything else in this project. It's the
persistent context a fresh Claude Code session needs — the rules below
apply regardless of which specific task you were opened for.

## What this is

A local mirror of `/volume1/docker/` on the NAS (UGREEN DXP2800, UGOS
Pro, 192.168.1.16, domain nmtaylor.org via Cloudflare). `compose/<project>/`
and `appdata/<project>/` here correspond 1:1 to the same paths there.
See `README.md` for the full layout and the per-project table.

## The one rule that overrides everything else: read/write boundary

| Location | Access | What it's for |
|---|---|---|
| Anything under `homelab/` (this whole directory — `compose/`, `appdata/`, `live-snapshot/`, `local_archive/`) | **Read/write** | Edit freely. This is the actual working copy. |
| `/Volumes/docker/...` (the Finder-mounted SMB share to the live NAS) | **Read-only. Always. No exceptions.** | Inspection and comparison only — confirming what's actually deployed, reading a live file's current content, refreshing `live-snapshot/`. **Never edit, write, or delete anything here, regardless of what a task seems to call for.** |

This has been a standing, explicit rule since before this repo existed,
and it does not change just because a task would be more convenient if
it did. If a task seems to require writing to `/Volumes/docker`, that's
a sign the task needs to be re-scoped (do the edit under `homelab/`,
then tell the user what to copy over and where) — not a reason to treat
the rule as flexible. If genuinely unsure whether a specific action
would touch `/Volumes/docker`, stop and ask rather than proceed.

Deploying a change to the actual NAS is **always a manual step the user
performs themselves** (or explicitly asks for help drafting the exact
commands *they* will run) — copying an edited file from `homelab/` onto
the NAS, then redeploying via UGOS's Docker Compose GUI. See "Manual
deploy checklist" below. Automating this end-to-end (e.g. a script that
pushes files to the NAS on its own) has been discussed and deliberately
deferred — don't build toward it unless explicitly asked to revisit
that decision.

## Secrets

- Every project's real secrets live in a `.env` next to its
  `docker-compose.yaml`, or directly in a `secrets.yml` for the handful
  of projects that use one. **Never write a real secret value into any
  tracked file.** `.gitignore`
  covers `.env` and `**/secrets.yml` everywhere in this repo — keep it
  that way.
- `.env.template` (and `.env.example`, kept identical, some tooling
  expects that exact name) holds placeholders only — `changeme` or
  similar. These ARE tracked and safe to read/share.
- If you need to know what a real value *is* for some operational reason
  (debugging, confirming something matches), read it from the live NAS
  file via `/Volumes/docker` (read-only) or ask the user — don't
  reconstruct it from memory across files, and don't write it down
  anywhere in `homelab/` once you've seen it.
- Before any commit, double-check `git diff --cached` doesn't contain a
  real-looking secret (a 32-char hex string, a token with a recognizable
  prefix, anything that isn't `changeme`/`${VAR}`). This project has hit
  this exact mistake before — see git log around the initial commit.

## Live vs. local

`live-snapshot/` holds a periodically-refreshed, gitignored copy of
what's actually on the NAS (`compose/` only — see `appdata/README.md`
for why `appdata/` runtime data isn't mirrored at all). Refresh it and
compare with the two helper scripts (both read-only against
`/Volumes/docker`, nothing here ever writes to it):

```bash
scripts/refresh-live-snapshot.sh   # user runs this — may be blocked for a
                                    # Claude Code session (bulk-copying files
                                    # with real secrets is a deliberate
                                    # manual-confirmation point, not a bug)
scripts/diff-live.sh               # safe for either to run — read-only
```

Anything listed is either a local change not yet deployed, or one of the
projects whose secrets got templated during the homelab-repo migration
(`domain_infra`, `kopia`, and others not shown here) still showing its
old inline-secret form on the NAS until it's redeployed with a real
`.env` alongside it there.

## Manual deploy checklist

For any change under `compose/<project>/` or `appdata/<project>/`:

1. Confirm the change is complete and, if it touches a compose file,
   valid YAML (`python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" path/to/docker-compose.yaml` — no separate tool needed).
2. Tell the user exactly which file(s) changed and where they need to go
   on the NAS (the path under `/volume1/docker/...` mirrors this repo's
   path under `compose/`/`appdata/` exactly).
3. The user copies the file(s) over themselves — Finder (the same SMB
   share mounted read-only at `/Volumes/docker` is writable from the
   NAS's own Finder connection, just not from this session) or `scp`.
4. The user redeploys via UGOS's Docker Compose GUI (recreate, not just
   restart, if `environment`/`volumes`/image changed).
5. Verify: `curl` the affected service's health endpoint if it has one,
   or check UGOS's container status. Refresh `live-snapshot/` and
   `diff` to confirm the deployed file now matches.

Never suggest or attempt a shortcut that writes to `/Volumes/docker`
directly, even to save the user a step.

## Sub-project docs

`compose/homepage/README.md`, `DEPLOYMENT.md`, and `LEARNING_GUIDE.html`
hold the Homepage-dashboard project's full history, deploy steps, and a
from-scratch study guide (YAML/HTML/CSS/JS/Docker/networking, taught
from this project's real files) — read `DEPLOYMENT.md`'s Part 4 for how
session-scoping was worked out for that project specifically (superseded
in spirit by this file, but the reasoning still holds).

## Other conventions

- Directory structure mirrors the NAS's real layout 1:1 — see `README.md`.
  When adding a new project, follow the same `compose/<name>/` +
  (only if there's real hand-edited config) `appdata/<name>/` pattern.
- Comment non-obvious decisions inline, in the file where the decision
  was made — this project's existing files (especially
  `compose/homepage/`'s) are full of examples of the expected level of
  detail: not what the code does, but why it's this way and what was
  tried and didn't work.
- `scripts/check-no-secrets.sh`, installed as the git `pre-commit` hook
  (run `scripts/install-hooks.sh` once after cloning — `.git/hooks/`
  itself is never tracked by git), blocks a commit if the staged diff
  contains anything that looks like a real secret. If it ever fires on a
  genuine false positive, fix the pattern narrowly rather than skipping
  it (`--no-verify`).
