# kopia — what each container does

A key to the services in `docker-compose.yaml`.

## kopia

Backup/repository server — meant to run the offsite backup schedule
against the `/repository` mount (currently `/mnt/kopia-backup`), with
`/volume1` mounted read-only as the source to back up. **Known
crash-looping as of this writing** and deliberately deprioritized: the
actual offsite copy right now is still a manual LaCie clone, so this
container isn't gating anything real yet. Not investigated further on
purpose — revisit when the automated schedule is actually wanted.

Runs with `--insecure`/`--disable-csrf-token-checks` on its server, which
would matter more if this were actually in active use on the LAN — worth
tightening before relying on it for real.

One mismatch worth knowing if cross-referencing the Docker Stacks panel
or WUD: this folder is named `kopia`, but the container's own Compose
project label (what WUD reports) is `kopia_backups` — already accounted
for in `compose/homepage/`'s `services.yaml`, but easy to miss elsewhere.
