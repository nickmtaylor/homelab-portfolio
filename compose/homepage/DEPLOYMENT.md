# Deployment & access manual

Two parts: (1) how to actually deploy this dashboard, and (2) how to make
sure a future Claude Code session helping you maintain it can only touch
the NAS files you specify.

## Keeping real secrets out of Claude sessions

`compose/.env.example` and `compose/.env.template` are identical,
placeholder-only copies (`changeme` for every secret) — safe to have in
any Claude session. The workflow going forward:

1. Ask Claude to make **structural** changes (add/remove/rename a
   variable) to `.env.template` only.
2. You fill in real values and save the result as `.env` **yourself**,
   outside any Claude session — by hand, or in a session scoped so it
   literally cannot read that file (see Part 2 below).
3. Never paste a filled-in `.env` back into a Claude conversation, and
   never point a session at the real `.env` on the NAS unless it's
   fenced off per Part 2.

`.env.example` stays as the reference copy matching what's documented in
Part 1 below; `.env.template` is the one to hand Claude for edits.

---

## Part 0 — docker-socket-proxy (deploy this first)

Both Homepage's `container:` status dots and WUD's update-checking go
through this now instead of a raw socket mount — deploy it before
(re)deploying either of those, or they'll have nothing to talk to.

1. Copy `compose/docker-socket-proxy/docker-compose.yaml` to
   `/volume1/docker/compose/docker-socket-proxy/docker-compose.yaml`.
   No `.env` needed — nothing in it is a secret.
2. Start it in UGOS Docker.
3. Verify from the NAS: `curl http://127.0.0.1:2375/containers/json`
   should return real JSON (a list of containers). If you get a 403,
   double check the `CONTAINERS=1` env var actually landed — UGOS's
   Docker GUI has, elsewhere in this project, sometimes not carried
   over every compose field on first import.
4. If Homepage or WUD are already running with the *old* raw-socket
   config, redeploy them now (see Parts 1 and 2) — both compose files
   and `appdata/docker.yaml` have already been updated to point at the
   proxy instead.

**Why this exists**: this replaces two earlier fixes that turned out not
to work — `group_add` for Homepage's socket permission issue doesn't
survive Homepage's own entrypoint script (it drops all supplementary
groups when switching to `PUID:PGID` via `su-exec`, confirmed by reading
`docker-entrypoint.sh` directly), and both Homepage and WUD were each
independently holding raw Docker socket access, which is exactly the
"multiple raw socket consumers" situation this was always meant to
replace. A plain HTTP request to a TCP port doesn't have the permission
problem a Unix socket does, which is what makes this actually work.

---

## Part 1 — Deploying the dashboard

1. **Copy files into place** on the NAS:
   - `compose/docker-compose.yaml` → `/volume1/docker/compose/homepage/docker-compose.yaml`
   - `compose/.env.example` → same folder, renamed to `.env`, values filled in
   - `appdata/settings.yaml`, `services.yaml`, `widgets.yaml`, `docker.yaml`,
     `bookmarks.yaml`, `custom.css`, `custom.js` → `/volume1/docker/appdata/homepage/`
     (create the folder first if it doesn't exist) — `bookmarks.yaml`
     overwrites Homepage's own auto-generated demo content (GitHub/
     Reddit/YouTube under "Developer/Social/Entertainment") that appears
     if the file doesn't exist on first boot.
     — **`docker.yaml` is required**, not optional, if any `services.yaml`
     entry uses `container:` (several do, for the status dots). Without
     it those entries show an "ERROR" badge instead of a status dot —
     confirmed the hard way on first deploy, see the note at the bottom
     of this file.

2. **Collect values** before starting the container, so widgets work on
   first load instead of showing errors:
   - Jellyfin: **Dashboard > Advanced > API Keys > +**
   - Home Assistant: **Profile (bottom left) > Security > Long-Lived
     Access Tokens > Create Token**
   - Uptime Kuma: the widget reads a **public status page**, not the API.
     Create one under Settings > Status Pages, add your monitors to a
     group on it, then grab the slug from the page's own URL
     (`.../status/<slug>`). If you'd rather skip this for now, delete the
     Uptime Kuma block from `services.yaml` — nothing else depends on it.
   - Weather: approximate latitude/longitude for `HOMEPAGE_VAR_WEATHER_LATITUDE`
     / `_LONGITUDE`. City-level precision is plenty.

3. **Start the container** in UGOS Docker (new project, pointed at the
   compose file above).

4. **Check it locally first**: `http://192.168.1.10:3000` — this is the
   `HOMEPAGE_ALLOWED_HOSTS` entry doing its job. If you get a 403 here,
   that env var is the first thing to check.

5. **Wire up remote access** (optional, once local works):
   - Add a new Cloudflare DNS **A record** for `dash` → your public IP,
     **grey cloud (DNS only)** — same as your `media` record.
   - Confirmed current `DOMAINS` value on `cloudflare-ddns`:
     `media.example.com`
     — append `,dash.example.com` to it.
   - Append `caddy-dash-site-block.txt` to your existing Caddyfile
     (`/volume1/docker/appdata/caddy/Caddyfile`), fill in a real bcrypt
     hash, then **recreate** the Caddy container (editing the file on disk
     alone won't reload it).
   - Test over cellular, not home Wi-Fi, per the hairpin NAT issue you've
     already hit with `media.example.com`.

6. **Clean up the retired Homarr dashboard**, now that Homepage replaces
   it (its container's already been deleted):
   - Remove the `hub.example.com` block from the Caddyfile.
   - Delete `compose/homarr/` and `appdata/homarr/` on the NAS once
     you're confident you don't need anything from the old config.
   - Delete or repoint `hub.example.com`'s Cloudflare A record — it
     isn't in `cloudflare-ddns`'s `DOMAINS` list, so it won't auto-update.

7. **Verify the theme.** `custom.css`/`custom.js` go in the same
   `appdata/homepage/` folder as `settings.yaml` — no separate mount.
   After editing either, do a hard refresh (`Cmd+Shift+R`) rather than a
   normal one; browsers cache `.css`/`.js` aggressively, so a stale
   cached copy is the most likely reason a change doesn't show up.
   Section accent colors in `custom.css` are matched to `services.yaml`'s
   group **order**, not name (`nth-of-type` selectors) — if you reorder
   or add/remove a top-level group later, update the numbers in the
   "PER-SECTION ACCENTS" block at the bottom of `custom.css` to match.

**Known gaps, not yet built** (see `README.md` for full reasoning):
- The NAS-hardware card is a visual mockup only right now — Glances
  isn't deployed yet. Scoped, just not built. Ask when you're ready.
- Home Assistant's card shows Homepage's default widget fields. If you
  want it scoped to just your light switches specifically, give me the
  actual switch entity IDs (Home Assistant → Settings → Devices &
  Services → Entities) and I'll add a `custom:` block.

---

## Part 2 — Docker Stacks monitoring (WUD), once Homepage is confirmed working

This is real, written code — not a mockup like the two gaps above — but
deliberately **not deployed yet**, per your call to get Homepage running
first. `services.yaml`'s "Docker Stacks" section will show zeros/errors
on every card until you deploy this.

1. **Copy files into place**:
   - `compose/wud/docker-compose.yaml` → `/volume1/docker/compose/wud/docker-compose.yaml`
   - `compose/wud/.env.example` → same folder, renamed to `.env`, values
     filled in (WUD's own admin login — pick a real username/password,
     used both for its web UI and by the collector to call its API)
   - `appdata/wud/collector/stacks_collector.py` →
     `/volume1/docker/appdata/wud/collector/stacks_collector.py`

2. **Start the project** in UGOS Docker — brings up two containers:
   `whatsupdocker` (the actual update-checker, web UI at
   `http://192.168.1.10:3002`) and `wud-stacks-collector` (the small
   script that turns WUD's per-container data into per-project counts).

3. **Verify**: `curl http://127.0.0.1:9100/stacks` from the NAS should
   return a JSON object keyed by project name. Give WUD a minute or two
   on first boot — it has to inspect every image before update status is
   accurate.

4. **One real unknown to check**: each card in `services.yaml`'s "Docker
   Stacks" section is hardcoded to a project name (`domain_infra`,
   `vaultwarden`, etc.) matching the compose folder names on your NAS.
   WUD reports each container's project via Docker's own
   `com.docker.compose.project` label, which normally *is* the folder
   name — but I haven't been able to run WUD myself to confirm it comes
   through byte-for-byte identical (case, hyphens vs. underscores) on
   your setup. If a card shows `0`/`0` even after WUD's had time to
   scan, check `curl http://127.0.0.1:9100/stacks` for the actual key
   name it's using and I'll fix the mismatched card.

5. `docker-socket-proxy` is now deployed for real (see Part 0) — this
   compose file already points WUD's watcher at it instead of a raw
   socket mount. Uptime Kuma's planned container monitoring can point at
   the same proxy whenever that gets built, rather than getting its own
   raw socket access either.

---

## Part 3 — System panel (NAS hardware stats + graphs)

CPU%, CPU temp (with history graphs for both), memory%, and storage% —
rendered by `custom.js` at the top of the page, backed by
`compose/glances/` (Glances itself + a small collector that keeps a
short in-memory history, since Glances' own `/history` API doesn't
track total CPU or sensor data — see the comments in
`system_metrics_collector.py` for specifics).

1. Copy `compose/glances/docker-compose.yaml` to
   `/volume1/docker/compose/glances/docker-compose.yaml`, and
   `appdata/glances/collector/system_metrics_collector.py` to
   `/volume1/docker/appdata/glances/collector/system_metrics_collector.py`.
   Copy `compose/glances/.env.template` to
   `/volume1/docker/compose/glances/.env` and fill in
   `WEATHER_LATITUDE`/`WEATHER_LONGITUDE` — use the exact same real
   values already sitting in Homepage's own `.env`
   (`HOMEPAGE_VAR_WEATHER_LATITUDE`/`_LONGITUDE`), it's the same
   physical location. `WEATHER_UNITS`/`WEATHER_LABEL` can stay at their
   defaults (`imperial`/`Home`) unless you want otherwise.
2. Start it in UGOS Docker — two containers: `glances` (the real
   monitoring agent, API+web UI on `127.0.0.1:61208`) and
   `system-metrics-collector` (port `9200`, deliberately bound to
   `0.0.0.0` — see the compose file's own comment on why that one's a
   justified exception to the localhost-only pattern used everywhere
   else in this project).
3. Copy the updated `appdata/widgets.yaml` and `custom.css`/`custom.js`
   over too if you haven't already — the native `resources` and `search`
   info-widgets were removed from `widgets.yaml` first (per your feedback
   that the info-widget "toolbar" styling and the web-search box didn't
   earn their place), and `datetime`/`openmeteo` were removed after that
   once the panel absorbed them as its own date/time/weather block —
   `widgets.yaml` is now intentionally empty.
4. Verify from the NAS: `curl http://127.0.0.1:9200/system` should
   return real JSON (`cpu_percent`, `cpu_temp_c`, `mem_percent`,
   `disks`, `primary_disk`), and `curl http://127.0.0.1:9200/weather`
   should return `{"available": true, "label": "Home", "temp": ..., ...}`
   once `WEATHER_LATITUDE`/`LONGITUDE` are filled in (empty coordinates
   fail closed to `"available": false`, not a crash). Give the CPU/temp
   graphs a couple minutes — they show a 2-minute rolling window (12
   samples at the 10s poll interval), so they fill in fast but also age
   out fast.
   **`curl` succeeding here is not enough to confirm the widgets will
   work in a browser** — see the CORS note below.
5. `primary_disk` is an exact match on `/mnt/volume1` (the mount point
   the compose file maps `/volume1` to), not a guess — no unknown to
   check here. Storage is shown as "#.## TB used / #.## TB remaining"
   (decimal TB, `used_bytes`/`size_bytes` from `primary_disk`), not a
   percentage.
6. **Known limitation, not a bug**: the panel only populates real data
   when viewed at the NAS's LAN address (`192.168.1.10:3000`). Over
   remote/cellular access via `dash.example.com`, it'll just show "—"
   for everything — port `9200` was never forwarded there, deliberately.
   This is a LAN-only convenience panel, not meant to be reachable from
   outside.
7. **CORS**: the dashboard page (`:3000`) and the metrics collector
   (`:9200`) are different origins to the browser even though they're
   the same host — a plain `fetch()` from `custom.js` gets silently
   blocked without an `Access-Control-Allow-Origin` header on the
   collector's responses. `curl` never hits this (it doesn't enforce
   CORS), so `curl http://127.0.0.1:9200/system` succeeding is not
   proof the browser widgets will populate — check the actual page too.
   Fixed in `system_metrics_collector.py` (wildcard origin — read-only,
   no credentials, LAN-only already, so no meaningful risk). If you
   deployed before this fix: copy the updated
   `system_metrics_collector.py` to
   `/volume1/docker/appdata/glances/collector/` and restart the
   `system-metrics-collector` container (a plain restart is enough — the
   script is bind-mounted, not baked into the image, so no rebuild
   needed). Confirm in the browser console: a red CORS error
   (`No 'Access-Control-Allow-Origin' header...`) targeting
   `:9200/system` means this exact fix; anything else is a different
   problem.

---

## Part 4 — Restricting a future session to specific files

**Superseded by the `homelab/` repo this project now lives inside —
see `homelab/CLAUDE.md` for the current, authoritative version of this
section.** Left here only because the general two-layer approach (where
you open the session, plus an optional settings.json allow/deny list)
still applies — but the specific example below, scoping a session
*directly at `/Volumes/docker/...` for edits*, is exactly backwards and
should not be followed. The NAS mount is read-only, always, full stop —
it's a live report of what's actually deployed, not a place to edit
from. Every edit happens in `homelab/` (this project's new home is
`homelab/compose/homepage/` + `homelab/appdata/homepage/`); the NAS is
only ever a copy destination and a read-only comparison source (see
`homelab/README.md`'s `live-snapshot/` mechanism).

There are two independent layers. Use the first one always; add the
second only if you want defense-in-depth on top of it.

### Layer 1 — where you open the session (does this by default, no config)

A Claude Code session's file tools can't reach outside whatever
directory it's working in unless you explicitly grant a new one (via a
directory-change prompt you see and approve). This is the boundary that
actually matters, and it costs nothing to set up:

- **For ongoing edits across the whole homelab**: open the session at
  `homelab/` itself.
- **Narrower, for one project only**: open it at
  `homelab/compose/homepage/` (or `homelab/appdata/homepage/` for just
  the dashboard's own config/theme files) instead — nothing outside
  that folder is reachable without you approving an explicit directory
  change first.
- **Narrower still**: if you only ever want `custom.css`/`custom.js`
  touched, point the session at a folder containing just those two
  files.

This alone is enough for "can only edit files I specify" in the normal
case — you're choosing the boundary every time you open a session, not
relying on a static config to remember it. `/Volumes/docker` should
never be the folder a session is opened at for editing purposes — at
most, grant it as an *additional* read-only-by-convention directory for
inspection, the same way this project has used it all along.

### Layer 2 — a settings.json permission allow/deny list (defense-in-depth)

If you want a *standing* rule that applies every time you open a session
in a given folder — even a broader one — Claude Code supports an
allow/deny list in `.claude/settings.json` (project-scoped: put it inside
the folder you're opening the session in). Rule syntax is
`"ToolName(<path-pattern>)"`:

```json
{
  "permissions": {
    "deny": [
      "Edit(**)",
      "Write(**)",
      "Edit(/Volumes/docker/**)",
      "Write(/Volumes/docker/**)"
    ],
    "allow": [
      "Edit(/Users/nmtaylor/Documents/homelab/compose/homepage/**)",
      "Write(/Users/nmtaylor/Documents/homelab/compose/homepage/**)",
      "Edit(/Users/nmtaylor/Documents/homelab/appdata/homepage/**)",
      "Write(/Users/nmtaylor/Documents/homelab/appdata/homepage/**)",
      "Read"
    ]
  }
}
```

- `deny` blocks `Edit`/`Write` everywhere by default, and explicitly
  re-blocks anything under `/Volumes/docker/` even if a broader `allow`
  rule elsewhere would otherwise cover it — belt and suspenders around
  the one path that must never be written to.
- `allow` re-opens them only for this project's two folders under
  `homelab/`.
- `Read` is left unrestricted so the session can still look around (e.g.
  the other compose projects, or the live NAS mount for comparison)
  without being able to change anything outside the allowed paths.
- Swap the paths for wherever you actually want edits scoped to — a
  different project under `homelab/compose/`, whatever's relevant that
  session — but never add `/Volumes/docker/` to an `allow` list.

One honest caveat: I've confirmed the `allow`/`deny`/`Read` rule *syntax*
against Claude Code's own settings schema, but I haven't been able to
test the exact glob-matching behavior for a path-scoped rule like this
one end-to-end in this session. Treat this as a strong starting point,
not a guaranteed-correct config — the first time you use it, check that
an edit inside the allowed path succeeds and one outside it is actually
blocked, before relying on it unattended.

**Permission modes** (`permissions.defaultMode`, also settable via
`/config` or the `--permission-mode` flag) interact with this list but
don't replace it:
- `default` — prompts for anything not explicitly allowed; the deny
  list above still hard-blocks regardless of what you'd click through.
- `acceptEdits` — auto-accepts file edits without prompting; the deny
  list is what stops it from accepting an edit outside the allowed path.
- `bypassPermissions` — skips prompts AND permission rules entirely.
  **Don't use this mode** for a session you're trying to fence in —
  it defeats both layers.
- `plan` — read-only planning mode, no edits at all regardless of rules.

For a homelab-editing session specifically: Layer 1 (open the session at
the right folder under `homelab/`) plus `default` or `acceptEdits`
permission mode is the practical setup. Add Layer 2 only if you want the
restriction to survive even if a future you (or a future me) tries to
`cd` somewhere broader
from inside that same session.

---

## Troubleshooting notes from first deploy

- **Every `container:` entry showed an "ERROR" badge instead of a status
  dot.** Root cause: Homepage requires a separate `docker.yaml` declaring
  the Docker connection, *and* each `services.yaml` entry using
  `container:` also needs `server: my-docker` (the name from
  `docker.yaml`) — the bare `container: <name>` field alone does nothing.
  Both were missing from the original file set; fixed as of this note
  (`docker.yaml` added, `server: my-docker` added to every entry that
  has a `container:` field).
- **The resources info-widget showed "API Error."** Root cause:
  `widgets.yaml` checked disk usage at `/volume1`, but only
  `/volume1/docker/appdata/homepage` is actually mounted into the
  container (at `/app/config`) — `/volume1` itself doesn't exist inside
  it. Fixed by pointing the disk check at `/app/config` instead, which
  reports the same underlying filesystem stats since a bind mount shares
  the host filesystem rather than creating a separate one.
- **Only the first group (Infrastructure) rendered; everything after it
  was blank space, live in the browser, not just in a print export.**
  Root cause: `custom.css` forced `flex-direction: column` on
  `#layout-groups`, which is natively a row-wrap flex container — each
  group already claims the full row width on its own via `style: row` in
  `settings.yaml`. Flipping to column flips which axis `flex-basis: 100%`
  applies to: instead of 100% width, each group claimed 100% of the
  parent's *height*, so only the first one ever got space. Removed the
  override entirely; it was never needed.
- **Status dots stayed red even with `docker.yaml` and `server:` correct.**
  Root cause: `/var/run/docker.sock` is owned by group `docker` (GID 121
  on this NAS, confirmed via `getent group docker`), which the
  container's `PGID=10` isn't a member of. First attempted fix —
  `group_add: ["121"]` — turned out not to work: Homepage's own
  `docker-entrypoint.sh` drops all supplementary groups when it calls
  `su-exec ${PUID}:${PGID}` to switch to the unprivileged user, wiping
  whatever `group_add` set before that line ever runs (confirmed by
  reading the actual entrypoint script). Real fix: `docker-socket-proxy`
  (Part 0) — a plain HTTP request to a TCP port doesn't hit this problem
  at all, since it was never about socket permissions once Homepage
  isn't touching the socket directly.
- **Homepage showed default demo bookmarks** (GitHub/Reddit/YouTube under
  "Developer/Social/Entertainment") that were never configured. Root
  cause: no `bookmarks.yaml` was ever delivered, so Homepage generated
  its own demo one on first boot. Added an empty `bookmarks.yaml` to
  overwrite it.
- **Jellyfin's card showed "API Error: Unexpected end of JSON input."**
  Root cause: Jellyfin 12.0 (confirmed via the container's own image
  label) dropped the legacy `/emby/*` compatibility routes that
  Homepage's Jellyfin widget uses by default — confirmed with
  `curl http://127.0.0.1:8096/emby/Sessions?api_key=...` returning 404
  directly against the NAS. Fixed by adding `version: 2` to the widget
  block in `services.yaml`, which switches Homepage to the native
  `Sessions`/`Items/Counts` paths with header-based auth instead.
- **Status dots stayed red for a while even after `docker-socket-proxy`
  was deployed and confirmed working** (`curl http://127.0.0.1:2375/containers/json`
  returned real data). Resolved once Homepage's container had actually
  been recreated to pick up the new `docker.yaml` — no code or config
  issue, just needed the redeploy to land. Worth remembering as a
  troubleshooting step if dots ever go red again: check whether the
  *config* changed without the *container* being recreated to match.

**Not part of this dashboard, but found along the way**: the `kopia`
container was observed crash-looping (`docker logs kopia` would show
why) while debugging the above — not investigated further since that
project isn't in active use yet.
- **`compose/glances/docker-compose.yaml` rejected outright with
  "Invalid configuration file"** in UGOS's Docker GUI, with no further
  detail shown ever, at any point in this — UGOS's own error reporting
  here is a dead end; every step below came from comparing against what
  was already successfully deployed in this project, not from any
  detail UGOS gave. Two directives turned out to be the problem,
  removed one at a time:
  - `pid: host` — removed first (highest suspicion, and confirmed not
    even needed: the 4 Glances endpoints this project actually calls,
    cpu/mem/fs/sensors, all read kernel-wide `/proc`/`/sys` counters,
    not per-process data that would need PID-namespace sharing). This
    alone did NOT clear the error.
  - `read_only: true` + `tmpfs:` — removed second. Also matches an
    inconsistency worth remembering on its own: that hardening pattern
    had only ever been applied to this project's own small Python
    collector scripts, never to a third-party image with real runtime
    needs (WUD itself was correctly left unhardened for the same
    reason) — Glances should have followed that same pattern from the
    start rather than needing a second failed deploy to catch it. Still
    didn't clear the error.
  - `volumes: - /:/rootfs:ro` — removed third (this was actually the
    first suspect raised, before `pid`, but got deprioritized behind
    the other two rather than tested directly — worth noting as a
    process mistake: when several directives are all untested, test
    the strongest suspect first rather than the easiest one to justify
    removing). Every other volume mount anywhere in this whole project
    targets a specific `/volume1/...` path; this was the only one
    mounting the bare host root, and UGOS's Docker GUI evidently
    restricts volume sources the same way other consumer NAS Docker
    GUIs are known to. Replaced with `/volume1:/mnt/volume1:ro` —
    narrower, matches the project's own established pattern, and turned
    the disk lookup from a "guess the biggest filesystem" heuristic
    into an exact match on a known mount point. This is what actually
    cleared the error.

  **General lesson**: UGOS's compose form appears to validate against a
  narrower set of recognized keys and volume-source paths than full
  Docker Compose supports (consistent with it silently dropping fields
  elsewhere earlier in this project too), and gives no detail when it
  rejects a file — not even which line or key. When this happens again:
  diff the failing file against whatever's already successfully
  deployed, list every directive that's genuinely new, and test them in
  order of actual suspicion rather than convenience — a mount of the
  bare host root or an unusual top-level key (`pid`, `privileged`,
  `group_add`, etc.) are the likeliest culprits based on this project's
  history so far.

- **Confirmed live** via `curl http://127.0.0.1:9200/system` after the
  fix above: real `cpu_percent`/`cpu_temp_c`/`mem_percent`, and
  `primary_disk` landing the exact `/mnt/volume1` match described above
  (62.8% used, matching `/volume1` directly — not a guess). One cosmetic
  detail worth knowing if the raw `disks` array is ever inspected
  directly: Glances' `fs` plugin also reports `/etc/resolv.conf`,
  `/etc/hostname`, and `/etc/hosts` as their own "mounts", each showing
  the same device/percent as `/mnt/volume1`. That's Docker itself —
  it always bind-mounts those three individual files into every
  container for DNS/hostname resolution, and Glances' `psutil`-based
  enumeration can't tell a single-file bind mount from a real
  filesystem. Harmless: `primary_disk` is an exact match on
  `mnt_point == "/mnt/volume1"`, so these three never affect what the
  panel actually shows — no code change needed, just don't be surprised
  by them in the raw JSON.

- **Panel stayed pinned at the top instead of scrolling with the page.**
  Root cause (confirmed against Homepage's own source): `html`, `body`,
  and `#__next` are all just `height: 100%` with no `overflow` set —
  Homepage's actual scroll region is a separate `<div id="inner_wrapper"
  class="... h-full overflow-auto">`, rendered by a `Wrapper` component.
  The panel was being inserted as `document.body`'s first child, a
  *sibling* to `#inner_wrapper`, not a node inside it — so it sat
  outside the scrollable area entirely and never moved when the rest of
  the page scrolled. Fixed by inserting as `#inner_wrapper`'s first
  child instead of `document.body`'s. Still safe against tab-switch
  reconciliation for the same reason the old insertion point was:
  `Wrapper`/`#inner_wrapper` isn't torn down when switching tabs — only
  `#layout-groups`, further down inside `Home`, is.
