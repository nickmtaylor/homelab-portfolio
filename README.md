# homelab

This is a personal, self-hosted infrastructure project — nine Docker
Compose services running on a home NAS (reverse proxy + TLS, a
password vault, smart-home automation, monitoring, encrypted offsite
backups, a status dashboard) — published as a curated subset of a
larger private repo.

The infrastructure itself isn't really the point. I work in client
services and software implementation, not engineering, and I'm not
applying for engineering roles. What this repo is actually meant to
show is **how I direct an AI coding agent (Claude Code) through real,
live systems with real constraints** — not "write me an email," but
root-cause debugging, architecture decisions, and building the
guardrails that keep an agent from doing something careless to
something that actually matters. That's a skill that transfers
directly to implementation work: scoping what a tool is allowed to
touch, verifying its output instead of trusting it, and documenting
decisions clearly enough that someone else (or a future session) can
pick them up cold.

Two things worth reading first, because they're the actual evidence:

## 1. The guardrails: [`CLAUDE.md`](CLAUDE.md)

Before ever pointing an agent at this project, I wrote it a standing
set of rules — not a one-off prompt, a persistent contract every
session has to follow regardless of what task it opens for. The core
of it is a hard boundary: this repo is read/write, but the Finder-mounted
share to the *live* NAS is read-only, always, no exceptions, even when
a task would be more convenient if the agent could just write there
directly. Deploying a change to the real NAS is a manual step I
perform myself, on purpose — automating that end-to-end was considered
and deliberately deferred.

That boundary isn't theoretical. It held under real pressure once: a
session tried to bulk-copy live files (several of them containing real
secrets) directly from the read-only share, and the safety design
stopped it. That's the point of writing the rule down before you need
it, not after.

## 2. Two problems this actually helped solve

**Rebuilding backups that had been silently broken for months**
([`compose/kopia/`](compose/kopia/)). The backup container had been
crash-looping for a long time, and in the meantime the "offsite backup"
was, in practice, just a manual drive clone — nobody had gone back to
find out why. Diagnosing it meant reading the actual container logs on
the live NAS (through the read-only mount, not guessing from the
compose file) to find the real cause: the repository config pointed at
a local filesystem path that was never actually mounted, so every
startup failed with "BLOB not found" against a repository that never
existed. The fix wasn't a restart — it was a real architecture change
(move the whole repository into Cloudflare R2 so there's no local disk
dependency at all), plus catching two non-obvious gotchas along the way:
a Cloudflare R2 API token has to be account-scoped or object access
silently fails, and a `docker exec` into the running server doesn't
inherit its environment, so a background CLI call without the password
passed explicitly fails with an opaque, unrelated-looking error. See
the comment at the top of
[`docker-compose.yaml`](compose/kopia/docker-compose.yaml) for the
full root-cause writeup and [`README.md`](compose/kopia/README.md) for
the rebuild.

**Finding a live secrets leak during the repo's own setup.** While
migrating this project into a proper repo, a review of what was about
to be checked in turned up real, live credentials — several API keys, a
service password, an access token — sitting in files that were
*supposed* to hold placeholders only. That wasn't a hypothetical risk,
it was already sitting there. The fix wasn't just deleting the values —
it became a standing, automated control: a pre-commit hook
([`scripts/check-no-secrets.sh`](scripts/check-no-secrets.sh)) that
scans every future commit for anything that looks like a real secret
and blocks it. The difference between "I found and fixed a problem" and
"I found a problem and made it structurally harder to happen again" is
most of what judgment means in this kind of work.

## What's here

| Project | What it does |
|---|---|
| [`docker-socket-proxy`](compose/docker-socket-proxy/) | Least-privilege proxy in front of the Docker socket — nothing else touches it directly |
| [`domain_infra`](compose/domain_infra/) | Caddy reverse proxy + TLS, Cloudflare dynamic DNS |
| [`glances`](compose/glances/) | System metrics, feeding a dashboard widget |
| [`home-assistant`](compose/home-assistant/) | Smart-home automation |
| [`homepage`](compose/homepage/) | The status dashboard tying everything together — see its own README, deploy log, and a from-scratch study guide it generated while I was learning the stack |
| [`jellyfin`](compose/jellyfin/) | Self-hosted media server |
| [`kopia`](compose/kopia/) | Encrypted, deduplicated offsite backups to Cloudflare R2 — see the rebuild story above |
| [`uptime-kuma`](compose/uptime-kuma/) | Uptime/health monitoring |
| [`vaultwarden`](compose/vaultwarden/) | Self-hosted password vault, exposed only via a Cloudflare Tunnel |
| [`wud`](compose/wud/) | Checks every other container for available image updates |

Every project follows the same pattern: a `docker-compose.yaml`, a
`.env.template` with placeholders only (real secrets never get
committed — see `CLAUDE.md`), and a `CONTAINERS.md` explaining what
each container does and why, not just how it's configured.

## What this isn't

This is a curated excerpt of a larger private repo, trimmed to the
parts relevant to this purpose — it's a proof of concept, not something
meant to be cloned and deployed by a stranger. Some paths and hostnames
are specific to my own setup and won't resolve for anyone else; that's
fine, they're not the point.
