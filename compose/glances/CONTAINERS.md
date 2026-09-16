# glances — what each container does

A key to the services in `docker-compose.yaml`. Order matches the
compose file. See `compose/homepage/DEPLOYMENT.md` for the fuller
history of getting this panel working (the "Invalid configuration file"
rejection mentioned below, and why several things here look like they
were arrived at rather than chosen upfront).

## glances

System-metrics daemon — exposes CPU/memory/filesystem/sensor data over
a REST API + web UI on port 61208. Feeds the system-metrics-collector
below; nothing else talks to it directly.

Notable choices, not defaults:

- **No `pid: host`** — Glances' own example compose enables it for
  per-process breakdowns, but the 4 endpoints actually used here
  (cpu/mem/fs/sensors) read kernel-wide `/proc`/`/sys` counters, not
  per-process data, so PID-namespace sharing buys nothing.
- **`/volume1:/mnt/volume1:ro`, not a bare `/:/rootfs:ro`** — the bare
  host-root mount was the actual cause of UGOS rejecting the compose
  file as invalid. Mounting the specific volume path also matches every
  other mount in this repo (none target bare host root) and makes the
  collector's disk lookup exact instead of a "guess the biggest
  filesystem" heuristic.
- **Bound to `127.0.0.1` only**, not `network_mode: host` — same
  reasoning as `docker-socket-proxy`: Glances' web UI shows detailed
  system data worth keeping off the LAN even though it's read-only.
- **No Docker socket / `docker-socket-proxy` access** — WUD already
  covers container status and update checks, so Glances doesn't need
  Docker API access of its own.

## system-metrics-collector

A small first-party Python script (`system_metrics_collector.py`, hand-
maintained in `appdata/glances/collector/`) that polls Glances'
snapshot endpoints and re-serves a simplified feed for Homepage's custom
widget. Hardened like every other first-party script in this repo:
runs as a non-root uid, `read_only: true`, `no-new-privileges`, all
capabilities dropped.

Two things it does that Glances' own API doesn't cover:

- Keeps its own short in-memory history (CPU% and CPU temp, a 2-minute
  rolling window) — Glances' `/history` endpoint doesn't track total CPU
  (only user/system sub-components) and has unclear sensor-history
  support, so polling the plain snapshot endpoints and keeping a private
  ring buffer sidesteps both gaps.
- Binds to `0.0.0.0`, not `127.0.0.1` like the rest of this project's
  scripts — Homepage's `custom.js` fetches this endpoint straight from
  the *viewer's browser*, not from another container, so it has to be
  LAN-reachable. Read-only hardware stats with no control capability,
  so this is a low-risk exception to the localhost-only pattern used
  everywhere else.

Home coordinates for its weather lookup live in `.env`
(`WEATHER_LATITUDE`/`LONGITUDE`), copied from Homepage's own `.env` —
fetched server-side here rather than from the browser, matching how the
native widget it replaced also kept those coordinates off the client.
