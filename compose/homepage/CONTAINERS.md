# homepage — what each container does

A key to the services in `docker-compose.yaml`. This project has much
deeper docs already — `README.md` and `DEPLOYMENT.md` in this folder
cover the full build history, and `LEARNING_GUIDE.html` is a from-scratch
study guide taught from these real files. This file is just the short
version for consistency with the rest of the repo.

## homepage

The dashboard itself (`gethomepage/homepage`) — the landing page for
every service in this homelab, driven by `services.yaml`/`settings.yaml`
under `appdata/homepage/`. Reads Docker container status through
`docker-socket-proxy` (`compose/docker-socket-proxy/`, must be deployed
first) rather than mounting the Docker socket directly — a plain HTTP
request to a TCP port needs no special container permission the way a
raw socket mount does.

`HOMEPAGE_ALLOWED_HOSTS` has to list every hostname a browser might send
in its `Host` header to reach this — both the LAN IP:port and the public
domain (no port, since a browser omits the default HTTPS port) — or
Homepage 403s the request. `custom.css`/`custom.js` sit alongside
`settings.yaml` in the same config volume; Homepage's own config/custom
mechanism reads them from there directly, no separate mount needed.
