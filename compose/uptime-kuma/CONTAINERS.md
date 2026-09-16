# uptime-kuma — what each container does

A key to the services in `docker-compose.yaml`.

## uptime-kuma

Uptime monitor — pings/HTTP-checks whatever endpoints are configured
through its own web UI and keeps history + sends alerts on downtime.
No secrets or hand-edited config in this compose file; monitors,
notification agents, and its own admin login are all set up and stored
in `appdata/uptime-kuma` (its own DB — not mirrored into this repo, see
`appdata/README.md`).
