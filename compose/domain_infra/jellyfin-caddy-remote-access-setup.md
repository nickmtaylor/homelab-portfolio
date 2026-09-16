# Jellyfin Remote Access Setup Reference

**Domain:** `media.example.com`  
**NAS:** UGREEN DXP2800 (UGOS Pro) at `192.168.1.10`  
**Jellyfin container:** `nmt_jellyfin` (host network, port 8096)  
**Reverse proxy:** Caddy with Cloudflare DNS challenge on port 8443  
**Last verified:** July 2026 — all tests passed (local `:8443`, cellular `https://media.example.com`)

---

## Architecture

```
Phone / TV app
  → https://media.example.com (port 443, internet)
  → Optimum router (port forward 443 → NAS:8443)
  → Caddy (HTTPS termination, Let's Encrypt via Cloudflare DNS)
  → Jellyfin at 127.0.0.1:8096 (HTTP, localhost only)
```

**What is encrypted:** Clients use HTTPS end-to-end to Caddy. Caddy talks to Jellyfin over plain HTTP on the NAS loopback only — that traffic never leaves the machine.

**What is NOT exposed:** Jellyfin port 8096, NAS admin ports 9443/9999, Caddy admin port 2019.

---

## Why This Setup Looks the Way It Does

### jellyfin.org is not your server address

The iOS app placeholder `https://jellyfin.org` is an example only. You need your own domain pointing at your home network.

### UGOS owns ports 80 and 443

UGOS Pro reserves standard web ports for the NAS admin UI, even when custom admin ports are 9999 (HTTP) and 9443 (HTTPS).

| Port | Behavior on this NAS |
|------|----------------------|
| 80 | UGOS (with "Redirect port 80 to HTTP port" enabled) |
| 443 | UGOS intercepts — Caddy on 443 caused `SSL_PROTOCOL_ERROR` |
| 8443 | Caddy (works) |
| 8096 | Jellyfin |
| 9443 | NAS admin HTTPS |
| 9999 | NAS admin HTTP |

**Solution:** Run Caddy on **8443**, forward router **443 → 8443**. Clients still use `https://media.example.com` with no port in the URL.

### Why not the official `caddy:2-alpine` image alone

- Port 80 is taken → Caddy cannot use HTTP-01 challenge; needed `auto_https disable_redirects` even for 443.
- Port 443 is taken by UGOS → traffic never reached Caddy (no log lines on cellular tests).
- Caddy on 8443 requires **Cloudflare DNS-01** for certificates → needs **custom image** with `github.com/caddy-dns/cloudflare` plugin.

### Why not Cloudflare orange cloud (proxied DNS)

Grey cloud (DNS only) is required for Jellyfin. Orange cloud proxies traffic through Cloudflare and often breaks streaming and WebSockets.

### Mac build → NAS import: amd64 required

DXP2800 uses Intel N100 (`linux/amd64`). Images built on Apple Silicon Macs default to `arm64`. Build with:

```bash
docker buildx build --platform linux/amd64 -t caddy-cloudflare:latest --load .
```

---

## Cloudflare Configuration

### DNS A record

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `media` | Public IP (e.g. `203.0.113.45`) | **DNS only (grey cloud)** |

**Critical:** Must be your **public** IP, not `192.168.1.10`.

### API token

Cloudflare → **My Profile** → **API Tokens** → **Create Token** → template **Edit zone DNS** → scope to `example.com` only.

Used by:
- Caddy container (`CLOUDFLARE_API_TOKEN`) — certificate issuance
- DDNS container — keeps A record updated when ISP changes IP

---

## UGOS Portal Settings

**Control Panel → Device Connection → Portal settings**

| Setting | Value |
|---------|--------|
| Web port (HTTP) | 9999 |
| Web port (HTTPS) | 9443 |
| Redirect HTTP to HTTPS | Disabled |
| Redirect port 80 to HTTP port | Enabled (OK — Caddy does not need 80) |
| Redirect port 443 to HTTPS port | Can stay enabled — Caddy uses 8443, not 443 |

**NAS admin bookmark:** `https://192.168.1.10:9443`

---

## File Layout on NAS

```
/volume1/docker/caddy/
├── Caddyfile          ← exact name, NO .txt extension
├── data/              ← Caddy writes certs here (Let's Encrypt)
└── config/            ← Caddy internal config
```

Let's Encrypt has no separate config file. Caddy stores certs automatically under `data/`.

---

## Caddyfile

```caddyfile
{
    email nick@example.com
    auto_https disable_redirects
}

media.example.com:8443 {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }

    encode zstd gzip

    reverse_proxy 127.0.0.1:8096 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
}
```

**Notes:**
- `8096` is correct even though clients use HTTPS — Caddy terminates TLS.
- `auto_https disable_redirects` prevents Caddy from binding port 80 (UGOS owns it).
- Published URL for apps is `https://media.example.com` (no `:8443`).

---

## Custom Caddy Image (Mac build, one-time)

### Dockerfile

```dockerfile
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

### Build commands (Apple Silicon Mac → Intel NAS)

```bash
mkdir -p ~/caddy-build && cd ~/caddy-build

cat > Dockerfile << 'EOF'
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
EOF

docker buildx build --platform linux/amd64 -t caddy-cloudflare:latest --load .

docker save caddy-cloudflare:latest | gzip > ~/Desktop/caddy-cloudflare-amd64.tar.gz
```

Verify architecture before uploading:

```bash
docker inspect caddy-cloudflare:latest --format '{{.Architecture}}'
# Expected: amd64
```

Upload `caddy-cloudflare-amd64.tar.gz` to NAS → UGOS Docker → **Import image**.

If `buildx` fails:

```bash
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap
```

Requires Docker Desktop on Mac.

---

## Docker Containers (UGOS GUI)

### Container 1: Caddy

| Setting | Value |
|---------|--------|
| Image | `caddy-cloudflare:latest` |
| Container name | `caddy` |
| Network | **Host** |
| Restart | Unless stopped |

**Volumes:**

| Host | Container | Mode |
|------|-----------|------|
| `/volume1/docker/caddy/Caddyfile` | `/etc/caddy/Caddyfile` | Read-only |
| `/volume1/docker/caddy/data` | `/data` | Read-write |
| `/volume1/docker/caddy/config` | `/config` | Read-write |

**Environment:**

| Name | Value |
|------|--------|
| `CLOUDFLARE_API_TOKEN` | Scoped Cloudflare token |

No port mappings when using host network.

**Note:** UGOS may not allow changing an existing container's image — create a new container when switching from `caddy:2-alpine` to `caddy-cloudflare:latest`. Stop the old container to avoid port conflicts.

### Container 2: Cloudflare DDNS

| Setting | Value |
|---------|--------|
| Image | `favonia/cloudflare-ddns:latest` |
| Container name | `cloudflare-ddns` |
| Network | **Host** |
| Restart | Unless stopped |

**Environment:**

| Name | Value |
|------|--------|
| `CLOUDFLARE_API_TOKEN` | Same scoped token |
| `DOMAINS` | `media.example.com` |
| `PROXIED` | `false` |

**Do not use** `oznu/cloudflare-ddns` — archived, unmaintained. Use `favonia/cloudflare-ddns`.

No volumes required.

### Container 3: Jellyfin (existing)

| Setting | Value |
|---------|--------|
| Container name | `nmt_jellyfin` |
| Network | Host |
| Port | 8096 |

---

## Jellyfin Dashboard Settings

**Dashboard → Networking:**

| Setting | Value |
|---------|--------|
| Published Server URL | `https://media.example.com` |
| Base URL | *(empty)* |
| Known Proxies | `127.0.0.1` |
| Allow remote connections | Enabled |
| Enable automatic port mapping (UPnP) | Disabled *(if present)* |

**Enable Auto Discovery** (UDP 7359): OK to leave on — LAN discovery only, not UPnP.

**Dashboard → Users:** Create accounts per person; disable public signup. This is the practical access control (no separate domain whitelist in Jellyfin).

---

## Optimum Router

**Admin:** [router.optimum.net](https://router.optimum.net) (Optimum ID)

### DHCP reservation

Reserve `192.168.1.10` for the NAS so the IP does not change.

### Port forwarding

| Name | Protocol | External | Internal IP | Internal port |
|------|----------|----------|-------------|---------------|
| Jellyfin-Caddy | TCP | 443 | 192.168.1.10 | **8443** |

**Do not forward:** 80, 8096, 9443, 9999, 2019.

### CGNAT check (if remote access stops working)

Compare [whatismyip.com](https://whatismyip.com) (on home Wi-Fi) to router WAN IP.

- **Match:** Port forwarding can work.
- **Different:** CGNAT — port forwarding will not work; options are call Optimum for public IP or switch to Cloudflare Tunnel.

---

## Testing Checklist

| # | Test | How | Expected |
|---|------|-----|----------|
| 1 | DNS | `nslookup media.example.com` | Public IP, not `192.168.1.10` |
| 2 | Caddy logs | UGOS Docker → caddy | `server running`, cert obtained |
| 3 | Local | Wi-Fi → `https://media.example.com:8443` | Jellyfin login |
| 4 | Remote | Cellular → `https://media.example.com` | Jellyfin login, valid HTTPS |
| 5 | Caddy activity | Load site on cellular, watch logs | New log lines appear |

**Ignore** `https://192.168.1.10` (raw IP) as a Caddy test — Caddy is configured for the hostname, not the IP.

**Cellular** is the real remote test. Home Wi-Fi may behave oddly due to hairpin NAT.

---

## Client Setup (Family Devices)

Server address on all devices:

```
https://media.example.com
```

No port number.

| Device | App |
|--------|-----|
| iPhone | Jellyfin (App Store) |
| Apple TV | Jellyfin tvOS app |
| Samsung TV | Jellyfin (Samsung store) |
| Roku | Jellyfin channel |

DLNA does not work remotely — native apps or browser only.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `SSL_PROTOCOL_ERROR` | UGOS on 443, not Caddy | Caddy on 8443; forward 443 → 8443 |
| No Caddy logs on cellular | Traffic not reaching Caddy | Port forward; CGNAT check |
| NAS UI at `media.example.com` | DNS pointed at LAN IP or UGOS on 443 | Fix A record; use 8443 path |
| Caddy won't start: port 80 in use | UGOS owns 80 | Add `auto_https disable_redirects` to Caddyfile |
| Caddy won't start: port 443 in use | UGOS owns 443 | Use 8443 + DNS challenge |
| Wrong architecture on import | Built arm64 on Mac | Rebuild with `--platform linux/amd64` |
| Endless loading on cellular | No port forward or CGNAT | Router rule; WAN IP check |
| App connects, playback fails | Jellyfin networking | Published Server URL; Known Proxies `127.0.0.1` |
| Cert errors in Caddy logs | Token invalid or DNS issue | Regenerate API token; confirm grey cloud |

### Errors encountered during setup (resolved)

1. **Port 80 bind error** — `auto_https disable_redirects` in global Caddyfile block.
2. **SSL_PROTOCOL_ERROR on cellular and local IP** — UGOS owned 443; moved Caddy to 8443 with custom Cloudflare DNS image.
3. **arm64 image rejected by NAS** — rebuilt with `docker buildx build --platform linux/amd64`.

---

## Alternatives Considered

| Option | Why not chosen |
|--------|----------------|
| Subdomain of jellyfin.org | Does not exist — must own a domain |
| DuckDNS (free) | Chose paid domain on Cloudflare instead |
| Tailscale | Roku awkward; wanted native app URL workflow |
| Cloudflare Tunnel | Valid fallback for CGNAT; chose Caddy + port forward |
| Cloudflare orange cloud | Breaks Jellyfin streaming |
| Official `caddy:2-alpine` only | No Cloudflare DNS plugin; ports 80/443 blocked by UGOS |
| Docker Hardened Images (`dhi.io/caddy`) | Same as official — still needs custom Cloudflare plugin build |
| Expose Jellyfin 8096 directly | Insecure; bypasses reverse proxy |

---

## Ongoing Maintenance

- Keep **cloudflare-ddns** running for dynamic IP updates.
- Caddy renews Let's Encrypt certs automatically.
- Periodically update Jellyfin, Caddy image, and DDNS container in UGOS Docker.
- Only port **443** should remain forwarded on the router.
- NAS admin stays at `https://192.168.1.10:9443` — never forward 9443.

---

## Quick Reference Card

```
Jellyfin URL (apps):     https://media.example.com
NAS admin:               https://192.168.1.10:9443
NAS local IP:            192.168.1.10
Jellyfin internal:       127.0.0.1:8096
Caddy listens:           8443
Router forwards:         443 → 192.168.1.10:8443
Cloudflare DNS:          media.example.com → public IP (grey cloud)
Caddy image:             caddy-cloudflare:latest (amd64, custom build)
DDNS image:              favonia/cloudflare-ddns:latest
Let's Encrypt email:     nick@example.com
```

---

## Rebuild Caddy Image (after plugin/Caddy version update)

```bash
cd ~/caddy-build
docker buildx build --platform linux/amd64 -t caddy-cloudflare:latest --load .
docker save caddy-cloudflare:latest | gzip > ~/Desktop/caddy-cloudflare-amd64.tar.gz
```

Import on NAS, recreate or restart Caddy container with new image.
