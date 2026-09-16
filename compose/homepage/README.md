# Homepage dashboard — setup notes

Base tool: [Homepage](https://gethomepage.dev/). This started as your
NAS-tailored baseline (services/widgets matched to your actual stack)
merged with the visual theme from a sanitized public Homepage config
posted by a Reddit user ("GexZ LabZ", Proxmox-based homelab — not
yours). **The theme has since been fully redesigned** (see "Theme v2"
below) — the GexZ-derived look is gone. For deploy steps and restricting
a future editing session to specific files, see
[DEPLOYMENT.md](DEPLOYMENT.md).

## Theme v2 — current state

`custom.css` was rewritten from scratch based on your own direction
(dark, high-contrast, primary colors, a normal typeface instead of
monospace, one accent color per Docker stack section) rather than
iterating further on the GexZ-derived look. The visual draft that
direction is built from went through a few rounds of feedback in an
Artifact during design — colors, typography, section-coding, and card
density were all settled there before being translated into this file.

What actually landed in `custom.css`, against Homepage's real, verified
selectors (same selector set the original port used — `.service-card`,
`.service-group-name`, `#myTab`, `#services > .services-group`, etc.):
- Space Grotesk (headings/tabs) + Work Sans (body) — no monospace
  anywhere.
- Near-black background, one accent color per top-level group in
  `services.yaml`, applied via `nth-of-type` on `.services-group` — so
  the mapping is by **group order**, not name. Reorder groups and the
  colors follow the wrong section until the `nth-of-type` numbers at the
  bottom of `custom.css` are updated to match.
- Cards keep a neutral dark surface with a 2px top accent border in
  their section's color, rather than the previous single green-only
  accent.
- The animated ambient background is gone — flat/quiet on purpose, so
  the section colors and card content carry the visual weight instead.

`custom.js` — the quick-launch search button (`/` or `Ctrl/Cmd+K`) is
unchanged; nothing in the redesign touched it.

**Not translated into `custom.css`/`services.yaml`** — these were part
of the visual mockup but need real backend work, not just CSS, so
they're deliberately left as designed-but-not-built:
- **NAS hardware card** (CPU/memory/storage/temp for the DXP2800): the
  mockup used Homepage's native `glances` widget. Needs a small Glances
  agent container added to `docker-compose.yaml` — a real, scoped
  infrastructure addition, not something to add silently. Ask when
  ready.
- **Home Assistant scoped to your actual switches**: right now the
  widget shows Homepage's default fields. Homepage supports a `custom:`
  block listing specific entity IDs (up to 4), which is the right fix
  given your HA instance is only configured for light switches — I just
  don't have your actual entity IDs to fill it in.

## Docker Stacks section (container status + update checking)

A new group, one card per docker-compose project on the NAS — container
count and pending-update count. Unlike the two mockup items above, this
is real, written code:

- `compose/wud/` — a new compose project running [What's Up
  Docker](https://github.com/fmartinou/whats-up-docker) (checks every
  container's image against its registry for updates — confirmed against
  WUD's own OpenAPI spec, not guessed) plus a small collector
  (`appdata/wud/collector/stacks_collector.py`) that groups WUD's
  per-container output by compose project and serves it as JSON.
- `services.yaml`'s "Docker Stacks" group — one `customapi` card per
  known project, pointed at the collector.
- A 7th section accent color (magenta) added to `custom.css` for this
  group.

**Deployed and confirmed working.** Two project-name mismatches turned
up once real data came in (WUD reports Docker Compose project names,
which don't always match the compose folder name — UGOS's Docker GUI
can register a project under a different name than its folder):
`kopia` → actually `kopia_backups`, and `wud` → actually
`wud-stacks-collector`. Both cards in `services.yaml` are pinned to the
real names now. See [DEPLOYMENT.md](DEPLOYMENT.md) Part 2 if this ever
needs redeploying from scratch.

## System panel (NAS hardware stats + graphs)

Five blocks in order: CPU% (with a 2-minute rolling graph), CPU temp
(same), date/time + weather (one combined, center-aligned block with a
small condition icon), memory%, and storage — a donut chart plus
"#.## TB used / #.## TB remaining" text, not a bare percentage.
Replaces both the native `resources`/`search` info-widgets that used to
sit at the top of the page (removed first, per feedback that the flat
"toolbar" styling didn't fit and the web-search box wasn't adding
anything) and the native `datetime`/`openmeteo` info-widgets (removed
second, once date/time/weather moved into this panel instead of sitting
in their own bar below it) — `widgets.yaml` is now intentionally empty.

Moving date/time/weather in here needed more than CSS: Homepage's
native info-widgets live deep in its own React tree, not as a sibling
this panel's flex row could reach with `order`, and physically
relocating that *live* DOM node would fight React's own reconciliation
the next time it re-renders (the clock ticks roughly every minute). So
the clock is reimplemented with plain JS (`Intl.DateTimeFormat`, same
timezone/format as the old widget), and weather is fetched from a new
`/weather` endpoint on the `system-metrics-collector` — which proxies
Open-Meteo server-side using coordinates from its own `.env`, the same
values already used by Homepage's own `.env`, rather than calling
Open-Meteo directly from `custom.js`. That was a deliberate choice, not
the easy path: a direct browser-side call would put your home
coordinates in a plaintext network request visible to anyone with
devtools open on the page. The old native `openmeteo` widget fetched
server-side for the same reason; proxying through the collector keeps
that property instead of quietly regressing it. The weather icon is a
small hand-drawn stroke SVG picked by keyword from the condition text
(sun/cloud/rain/snow/fog/thunderstorm) — Homepage's own openmeteo icon
set isn't vendored into this project, so it's a stand-in, not a port.

The panel itself has no header row and no background of its own
anymore — an earlier version had a "SYSTEM" label + status dot and
painted its own `var(--bg)` rectangle, which blocked the soft glow
`body`'s own radial-gradient background paints near the top of the
page, reading as a separate colored band bolted onto the page rather
than blending in with everything else. It's transparent now, so that
gradient shows straight through, same as it does behind the rest of the
page.

This is genuinely different from the Docker Stacks cards above: a graph
isn't something Homepage's native `customapi` widget can render at all
(confirmed against the docs — it only shows flat stat fields), so this
is hand-built DOM/SVG in `custom.js`, backed by a new `compose/glances/`
project (Glances itself, plus a small collector that keeps its own
short in-memory history — Glances' own `/history` API turned out not to
track total CPU, only its user/system sub-components, and has no clear
support for sensor/temperature history at all).

Two design points worth knowing about if you're ever touching this
again:
- The panel is inserted as `#inner_wrapper`'s **first child** —
  `#inner_wrapper` is Homepage's actual scrolling container (confirmed
  against its source: `html`/`body`/`#__next` are all just
  `height: 100%` with no overflow of their own; the real
  `overflow-auto` scroll region is a div with this id, rendered by a
  `Wrapper` component). An earlier version inserted as `document.body`'s
  first child instead — a sibling to `#inner_wrapper`, not inside it —
  which put the panel outside the scrollable area entirely, so it
  stayed pinned at the top instead of scrolling away with the rest of
  the page. `#inner_wrapper` is still the right level to insert into
  rather than going deeper: it isn't torn down on tab switches (only
  the `#layout-groups` content inside `Home`, further down, is), so
  it's still outside the part of the tree that actually gets rebuilt —
  inserting further in, inside the React-managed tab content itself,
  would risk being torn out or erroring on the next re-render.
- The metrics collector binds `0.0.0.0:9200` (LAN-reachable), not
  `127.0.0.1` like everything else in this project. That's deliberate,
  not an oversight: `custom.js` fetches this from the *browser*, not
  from another container, so it has to be reachable from wherever the
  dashboard is being viewed. Read-only hardware stats are low-risk to
  expose on the LAN compared to the Docker-API-touching services
  elsewhere here.

See [DEPLOYMENT.md](DEPLOYMENT.md) Part 3 for deploy steps. Storage
usage is an exact match on `/volume1` (mounted at `/mnt/volume1` in the
`glances` container) rather than a guess — that mount also turned out
to be the actual cause of a multi-round "Invalid configuration file"
rejection from UGOS's Docker GUI on first deploy (it was originally a
bare host-root mount); full story in `DEPLOYMENT.md`'s troubleshooting
notes if it's useful precedent later.

The collector's `curl`-based API check is not sufficient to confirm the
widgets work — the collector (`:9200`) and the dashboard page (`:3000`)
are different origins to a browser even on the same host, so the
collector needs `Access-Control-Allow-Origin` on its responses or
`fetch()` from `custom.js` gets silently blocked (while `curl`, which
doesn't enforce CORS, still succeeds). Fixed in
`system_metrics_collector.py`; see `DEPLOYMENT.md` Part 3, step 7.

## What changed from the original baseline

- **Weather widget**: added to `widgets.yaml` using Homepage's native
  `openmeteo` provider — no API key needed, just approximate lat/long.
- **Title**: changed from "GexZ-style dashboard for nmtaylor.org" to
  `nmtaylor.org`.
- **Kopia card removed** from `services.yaml` for now — see below.
- **Corrected a stale instruction**: the reddit repo's own docs said to
  drop `custom.css`/`custom.js` into a `public/` folder. Checked against
  the current [gethomepage.dev custom CSS/JS docs](https://gethomepage.dev/configs/custom-css-js/):
  the actual mechanism is `config/custom.css` and `config/custom.js` —
  same directory as `settings.yaml`. No extra volume mount needed; both
  files just go in `/volume1/docker/appdata/homepage/` alongside the rest.

## What was left out, and why

- **Custom header / live telemetry strip**: the source repo replaces
  Homepage's native header with one showing PVE CPU/RAM, Docker container
  counts, WAN ping, and DNS block rate. PVE and DNS-block-rate have no
  equivalent on your NAS (no Proxmox, no live Pi-hole/AdGuard). Docker
  counts would need a socket mount on a new container, which cuts against
  the docker-socket-proxy hardening you've already flagged as a follow-up
  — better to wait and point everything (including this) at the proxy
  once it exists, rather than adding another direct socket consumer now.
  Weather and clock are already covered by Homepage's own native widgets,
  so the header swap wasn't adding much beyond looks — and replacing
  Homepage's native header means hiding it via CSS selectors that could
  break on a version update, for a smaller payoff than it first looked.
- **Proxmox, Frigate, CrowdSec, Grafana/Prometheus, Pterodactyl, game
  servers, AdGuard/Pi-hole, NPMPlus, Authentik, Dockge** — all from the
  source repo's stack, not yours. Not touched.

## Deploy order

Moved to [DEPLOYMENT.md](DEPLOYMENT.md), along with instructions for
restricting a future Claude Code session to only edit specific NAS
files. Kept separate from this file since deploy steps are something
you'll follow start-to-finish, while this README is more "why things are
the way they are" reference.

## Things worth deciding rather than defaulting on

- **Docker socket mount**: resolved. `docker-socket-proxy` (`compose/docker-socket-proxy/`)
  is now the only thing touching the raw socket — Homepage and WUD both
  reach it over `127.0.0.1:2375` instead of mounting the socket
  themselves. See `DEPLOYMENT.md` Part 0. (This is also why the earlier
  `group_add` fix for Homepage's status-dot permissions was replaced
  rather than kept — it turned out not to survive Homepage's own
  entrypoint script, see `DEPLOYMENT.md`'s troubleshooting notes.)

- **Secrets in `.env`**: kept Homepage-specific per your call — it's the
  one service holding several other services' API keys in one place, a
  meaningfully different risk profile than one container's own inline
  vars. Your other projects (e.g. `domain_infra`) weren't touched; if you
  want those moved to per-project `.env` files too later (matching
  Vaultwarden's existing pattern — recommend against one shared file
  across all projects, since that raises the blast radius of a single
  leak and makes it harder to tell which project owns which var), that's
  a separate, scoped task — say the word and I'll do it (I've since
  inspected their live compose files via the `/Volumes/docker` mount, so
  I'm not starting blind).

- **Basic auth on `dash.nmtaylor.org`**: required, not optional, if you want
  this dashboard password-protected at all. Checked against current docs —
  Homepage has no built-in login of its own (unlike Jellyfin/Home
  Assistant, which each have their own app-level login). Caddy's
  `basic_auth` is the only mechanism available, and it's worth having since
  Homepage surfaces status/queue data pulled with your backend services'
  API keys, plus links to LAN-only tools. Also worth knowing: none of your
  other live subdomains currently have a `basic_auth` block in Caddy
  either — each relies entirely on its own app-level login. That's a
  separate, bigger decision if you ever want defense-in-depth across the
  board; not addressed here.

- **Kopia card**: removed from `services.yaml` since there's no configured
  repository or snapshot schedule yet (current offsite copy is a manual
  clone to the LaCie drive, not a live Kopia repo). Add back a
  `container: kopia` status-dot card once the Kopia container is actually
  up, and a widget block once it has a server API you can point at.

## What's deliberately left out

- Frigate, CrowdSec, Grafana/Prometheus, Pterodactyl, game servers,
  NPMPlus, Authentik, Dockge, AdGuard/Pi-hole — all from the source
  repo's stack, not yours.
- The bespoke Media "control room" panel and custom telemetry header —
  see above for the reasoning. Good candidates for a focused follow-up
  if you want that look specifically, once the base theme is running and
  you know what you actually want to see at a glance.
