# domain_infra — what each container does

A key to the services in `docker-compose.yaml`. Order matches the
compose file.

## caddy

Reverse proxy in front of everything exposed at `*.example.com` —
terminates HTTPS and routes each subdomain to the right container's
port. Uses a Cloudflare-DNS-plugin build (`caddy-cloudflare`, not stock
Caddy) so it can issue/renew certs via DNS-01 challenge against
Cloudflare, which works even for services that aren't reachable from the
public internet. Routing rules live in `Caddyfile`
(`appdata/caddy/Caddyfile` here, hand-edited).

## cloudflare-ddns

Keeps Cloudflare's DNS records for this domain pointed at the NAS's
current public IP. `PROXIED=false` means these records resolve straight
to the home IP rather than going through Cloudflare's proxy — intentional
here since Caddy is already the thing terminating TLS; proxying through
Cloudflare too would be a redundant hop for a residential connection
already relying on DNS-01 (not HTTP-01) for cert issuance.
