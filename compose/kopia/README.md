# kopia — offsite backups to Cloudflare R2

Backs up `/volume1/docker` (all of it — see "Why back up `/volume1/docker`
at all" below) and `/home/nmtaylor` to a Kopia repository that lives in a
Cloudflare R2 bucket. No local disk in the loop, which is what killed the
previous setup (see the comment at the top of `docker-compose.yaml` for
the root-cause story).

Kopia's own server process (already what this container runs) handles
scheduling internally via policies — no separate cron container needed.

## 1. Cloudflare-side setup (you do this, in the Cloudflare dashboard)

1. Log into the Cloudflare dashboard -> **R2 Object Storage** -> **Create
   bucket**. Name it something like `nas-backups`. Location: Automatic.
   - R2 requires a payment method on file even to use the free tier
     (10 GB storage, no egress fees, 1M Class A / 10M Class B ops per
     month). Check roughly how big `/volume1/docker` + `/home/nmtaylor`
     actually are (`du -sh`) before assuming this stays free — Kopia
     dedupes and compresses, so actual usage is usually noticeably less
     than raw size, but worth knowing going in.
2. **Manage R2 API Tokens** -> **Create API Token** -> permission
   **Object Read & Write**, scoped to just this bucket if the UI lets
   you narrow it. Save the **Access Key ID** and **Secret Access Key**
   it shows you — the secret is shown exactly once.
   - This has to be an **account-scoped** token, not a user-scoped one —
     R2 buckets are account resources, so a token tied only to your user
     profile can't grant object access to one. Creating it from this R2
     screen (rather than the generic My Profile -> API Tokens builder)
     scopes it to the account automatically, so there's nothing to pick
     here — just don't recreate this via the generic builder without
     explicitly setting resource type to Account, and never use the
     legacy Global API Key (full account access, not R2-scoped at all).
3. Note your **Account ID** (shown on the R2 overview page). The
   S3-compatible endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
4. Copy `.env.template` to `.env` next to this README and fill in
   `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, plus `KOPIA_PASSWORD` / `KOPIA_SERVER_PASSWORD`
   (pick real values, don't reuse ones from anywhere else). Do this on
   the NAS itself, or locally and copy `.env` over — never commit it.

## 2. Clear out the old, broken repository state (on the NAS)

The existing `/volume1/docker/appdata/kopia/config/repository.config`
points at the dead local-filesystem repository. Delete or rename it
(and it's fine to clear `appdata/kopia/cache/` too) before starting
fresh — there's nothing worth keeping in it, it never successfully held
a real backup.

```bash
mv /volume1/docker/appdata/kopia/config/repository.config /volume1/docker/appdata/kopia/config/repository.config.bak
rm -rf /volume1/docker/appdata/kopia/cache/*
```

## 3. Deploy the updated compose file

Standard deploy checklist from the repo root `CLAUDE.md`: copy this
folder's `docker-compose.yaml` (and your real `.env`) to
`/volume1/docker/compose/kopia/` on the NAS, then **recreate** (not
restart) via UGOS's Docker Compose GUI, since `volumes` changed.

It'll still crash-loop at this point — expected, there's no repository
yet. That's step 4.

## 4. One-time bootstrap: create the repository (on the NAS, via SSH)

This has to be a one-off `docker run` using the same image and config
volume, *not* the long-running compose service — `kopia server start`
can't create a repository, only connect to one that already exists.

```bash
docker run --rm -it \
  -e KOPIA_PASSWORD='<the real KOPIA_PASSWORD from .env>' \
  -v /volume1/docker/appdata/kopia/config:/app/config \
  -v /volume1/docker/appdata/kopia/cache:/app/cache \
  -v /volume1/docker/appdata/kopia/logs:/app/logs \
  kopia/kopia:latest \
  repository create s3 \
    --bucket='<R2_BUCKET_NAME>' \
    --endpoint='<R2_ACCOUNT_ID>.r2.cloudflarestorage.com' \
    --access-key='<R2_ACCESS_KEY_ID>' \
    --secret-access-key='<R2_SECRET_ACCESS_KEY>' \
    --region=auto
```

This writes a fresh `repository.config` into the shared config volume.
Once it exits successfully, the compose service (already up from step 3,
crash-looping) will pick it up on its next restart and come up clean —
recreate the `kopia` container once more, or just wait for
`restart: unless-stopped` to retry it.

## 5. Add the two backup sources + a schedule

Also on the NAS, once the `kopia` container is up and healthy. Every one
of these spawns a fresh `kopia` CLI process inside the container (not the
running server), which needs the repository password passed explicitly
via `-e` — it doesn't inherit it the way the server did at startup, and
without a real terminal attached it can't fall back to an interactive
prompt either (that's the "inappropriate ioctl for device" error if you
forget it):

```bash
sudo docker exec -e KOPIA_PASSWORD='<the real KOPIA_PASSWORD from .env>' kopia \
  kopia policy set --global --compression zstd

sudo docker exec -e KOPIA_PASSWORD='<the real KOPIA_PASSWORD from .env>' kopia \
  kopia snapshot create /data/docker
sudo docker exec -e KOPIA_PASSWORD='<the real KOPIA_PASSWORD from .env>' kopia \
  kopia snapshot create /data/personal

# daily at 3am, keep a reasonable history without R2 storage growing forever
sudo docker exec -e KOPIA_PASSWORD='<the real KOPIA_PASSWORD from .env>' kopia \
  kopia policy set /data/docker   --times-of-day 03:00 \
  --keep-latest 10 --keep-daily 14 --keep-weekly 8 --keep-monthly 6 --keep-annual 2
sudo docker exec -e KOPIA_PASSWORD='<the real KOPIA_PASSWORD from .env>' kopia \
  kopia policy set /data/personal --times-of-day 03:00 \
  --keep-latest 10 --keep-daily 14 --keep-weekly 8 --keep-monthly 6 --keep-annual 2
```

Compression is set first and globally since it applies to new content as
it's written — better to have it on before the first real snapshot than
to recompress everything after the fact.

The `kopia snapshot create` calls just establish each path as a known
source and take the first snapshot immediately; the `policy set` calls
are what make it recurring. As long as the server keeps running, it
snapshots on schedule with no cron needed. Check progress any time at
`http://192.168.1.16:51515` (server username/password from `.env`), or
`docker exec kopia kopia snapshot list`.

## Why back up `/volume1/docker` at all — isn't that already in GitHub?

Only partly. GitHub has `compose/` (every `docker-compose.yaml` +
`.env.template`) and the small hand-edited subset of `appdata/` listed in
[`appdata/README.md`](../../appdata/README.md) — Caddy config, Homepage's
YAML, etc. It does **not** have the runtime state that actually can't be
regenerated: Vaultwarden's real vault, Home Assistant's recorder DB,
Uptime Kuma's history, Jellyfin's watch history — all of that lives only
on the NAS.

Backing up all of `/volume1/docker` anyway (rather than trying to carve
out just `appdata/`) costs effectively nothing extra: Kopia
content-addresses and dedupes, so the parts that duplicate what's already
in git compress down to almost nothing. Simplicity wins over a precise
exclude list here.

## Not yet handled

Media itself (the actual library, not just the `*arr` config DBs) is
still out of scope — per the original ask, that's waiting on an
additional drive and a real clone/replication plan, not something to
route through R2.
