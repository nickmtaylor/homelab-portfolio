# home-assistant — what each container does

A key to the services in `docker-compose.yaml`.

## home-assistant

Home automation hub — integrations, automations, dashboards, and device
control all live in its own config DB under `appdata/home-assistant/`
(not mirrored into this repo — see `appdata/README.md`, it's large and
includes real usage/recorder history). No secrets in the compose file
itself; API tokens for anything that talks to HA (e.g. a long-lived
access token) are issued from HA's own UI, not set here.
