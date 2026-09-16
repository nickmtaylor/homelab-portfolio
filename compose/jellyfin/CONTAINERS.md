# jellyfin — what each container does

A key to the services in `docker-compose.yaml`.

## jellyfin

The media server — indexes `/volume1/media` (mounted read-only, Jellyfin
never needs to write into the library itself) and streams it out to
clients. `cache` and `config` are split into separate volumes: `cache`
holds transient transcoding/image-extraction data that's fine to lose,
`config` holds the actual library DB, users, and watch history — kept
apart so a cache clear-out can never risk the real config. Neither is
mirrored into this repo (see `appdata/README.md`) — both are large and
personal (metadata cache, watch history).

No secrets in the compose file: API keys for anything that talks to
Jellyfin (Homepage's status widget) are issued from Jellyfin's own web
UI, not set here.
