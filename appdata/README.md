# appdata/ — what's mirrored here, and what isn't

This folder mirrors `/volume1/docker/appdata/` **by name, not by content.** Every
subfolder that exists live on the NAS is accounted for below, but only the
ones holding genuine hand-edited *configuration* actually have files here.
The rest are intentionally left out — not forgotten.

## Why not just copy everything

Most of `/volume1/docker/appdata/<app>/` is runtime state, not config: each
app's own database, image caches, thumbnails, session tokens, logs — data
the app itself manages, that you never hand-edit and that git has no
business tracking (some of it is tens of gigabytes; some of it is
personal — watch history, download history — not something to casually
duplicate onto a laptop or into git history).

The one test that matters: **would you ever open this file in an editor
and change it by hand?** If yes, it's mirrored here. If no — it's Kopia's
own cache, Jellyfin's media metadata — it's left off this list on
purpose, exactly the same call already made for
`nas-homepage/appdata/` only ever holding Homepage's own YAML/CSS/JS, never
a full copy of everything under `appdata/homepage/` on the NAS.

## What's actually mirrored here

| Folder | What's here | Why it's config, not runtime state |
|---|---|---|
| `homepage/` | `*.yaml`, `custom.css`, `custom.js` | Every one of these is hand-edited directly |
| `wud/collector/` | `stacks_collector.py` | This project's own script |
| `glances/collector/` | `system_metrics_collector.py` | This project's own script |
| `caddy/` | `Caddyfile` | Hand-edited reverse-proxy rules |

## What's live on the NAS but deliberately not mirrored here

| Folder | What's actually in it |
|---|---|
| `home-assistant/` | HA's own config DB, recorder history, integrations — large, and includes real usage history |
| `jellyfin/` | Media metadata cache + watch history — large, personal |
| `kopia/` | Repository config/cache/logs — see `compose/kopia/` for the compose side |
| `uptime-kuma/` | Monitor history DB |
| `vaultwarden/` | The actual encrypted vault — obviously never mirrored anywhere else |

If you ever need to inspect one of these for real, it's still reachable
read-only via the Finder-mounted `/Volumes/docker/appdata/<name>` share —
nothing here changes that, this file just documents why it isn't also
duplicated into this repo.
