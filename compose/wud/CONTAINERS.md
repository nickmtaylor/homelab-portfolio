# wud — what each container does

A key to the services in `docker-compose.yaml`. Order matches the
compose file. See `compose/homepage/DEPLOYMENT.md` ("Part 3") for the
fuller deploy-order history.

## whatsupdocker

What's Up Docker — watches every container's image and reports whether
a newer version is available (no auto-updating, just detection). Moved
off its default port `3000` to `3002` since Homepage already owns `3000`
under shared `network_mode: host` networking. Points its Docker watcher
at `docker-socket-proxy` (`127.0.0.1:2375`) instead of mounting the raw
socket — confirmed against WUD's own source
(`watchers/providers/docker/Docker.ts`) that host+port is a first-class
config option, not a workaround. Must be deployed after
`docker-socket-proxy`.

## stacks-collector

A small first-party Python script
(`appdata/wud/collector/stacks_collector.py`, hand-maintained) that
calls WUD's own REST API — reusing WUD's admin credentials
(`WUD_USER`/`WUD_PASS` in `.env`) rather than needing separate Docker
access — to feed Homepage's custom per-stack update-status widget.
Hardened the same way as `glances`' collector: non-root uid, read-only
root filesystem, `no-new-privileges`, all capabilities dropped.
