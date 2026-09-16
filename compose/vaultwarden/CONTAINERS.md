# vaultwarden — what each container does

A key to the services in `docker-compose.yaml`. Order matches the
compose file.

## vaultwarden

Self-hosted password-manager server (Bitwarden-compatible API) — the
actual encrypted vault lives in `appdata/vaultwarden` (never mirrored
into this repo, obviously). `SIGNUPS_ALLOWED=false` keeps it from
accepting new accounts beyond whatever's already there; `ADMIN_TOKEN`
(a real secret, from `.env`) gates the `/admin` panel used for user
management. Reachable directly on the LAN at its host port (`network_mode: host`,
`ROCKET_PORT=8222`, like everything else in this repo), but not exposed
to the internet directly — external access goes through the
`cloudflared` tunnel below instead.

## cloudflared

Cloudflare Tunnel client — the only way in to Vaultwarden from outside
the LAN. Authenticates purely with `CLOUDFLARE_TUNNEL_TOKEN` (a secret
from `.env`); the tunnel's routing (which hostname maps to Vaultwarden)
is configured on Cloudflare's side, not in this compose file. Using a
tunnel here instead of Caddy + DNS (like every other public-facing
service in `compose/domain_infra/`) means Vaultwarden's port is never
opened on the router at all — no inbound port-forward exists for it,
which matters more for a password vault than for anything else in this
repo.
