# docker-socket-proxy — what each container does

A key to the services in `docker-compose.yaml`. Order matches the
compose file.

## docker-socket-proxy

Sits between the Docker socket (`/var/run/docker.sock`) and anything on
the NAS that needs to ask Docker questions — right now that's Homepage's
container status dots and WUD's update checking. Nothing talks to the
real socket directly; everything goes through this proxy at
`127.0.0.1:2375` instead, so a compromised or misbehaving container
never gets the socket itself (which is effectively root on the host).

Two deliberate restrictions, not defaults:

- **Read-only** (`POST=0`) — no state-changing calls at all, only
  GET/HEAD.
- **Minimum API scope** — only `CONTAINERS`, `INFO`, `IMAGES`, `EVENTS`
  are enabled (what Homepage and WUD actually use today). Everything
  else (`AUTH`, `SECRETS`, `EXEC`, `BUILD`, `SWARM`, `VOLUMES`,
  `NETWORKS`, ...) stays at its default of `0`. If something new needs
  another section, it fails closed with a 403 rather than silently
  working — the fix is adding that specific env var, not widening this
  broadly.

Bound to `127.0.0.1` only (bridge networking, not `network_mode: host`
like everything else in this repo) so it's reachable from other
containers on the NAS but never exposed on the LAN — see the compose
file's own comment for why host mode specifically would have defeated
that.
