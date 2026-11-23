# Nick's Homelab

Hello and welcome to my GitHub portfolio! I’m glad you’re here!

Over the summer I purchased a network-attached storage (NAS) server, and since then I’ve been building what enthusiasts call a “homelab”, or a personal cloud server. I first became interested in building a homelab a few years ago after my family moved out of my childhood home. We had this really old Dell computer tower that wouldn’t boot up after ~15 yrs of use, but I knew there were thousands of pictures, videos, and documents still on the hard drive that I wanted to preserve. Preserving old photos through stale backups eventually turned into the desire to share said content without a subscription, which then turned into a way to automate smart home devices, hold passwords, create encrypted off-site backups of sensitive data, and more. Each new deployment gave rise to the next one like a snowball picking up more snow as it careens down a mountain. I preach the importance of “systems exposure” to my clients through their SaaS deployments: the quicker someone can actually click around in a tool and get hands-on experience, the greater frequency of “lightbulb” moments take place where connections are made between what they see and what they want.

I was first introduced to AI tools like Claude Code and Cursor at the start of 2026, and have been fascinated at the speed of development in the industry as these tools have become more pervasive. I started this project with limited technical experience in software engineering, and while applications like Docker make it very easy to deploy these systems, I want to keep my skills sharp as I look for my next professional opportunity. This repository is a selection of infrastructure that is currently deployed on my home server (Claude Code’s features to deploy PRs directly into GitHub really came in handy here). All of the data has been scrubbed of any PII for my specific system.

Here’s a quick rundown of what you’ll see:
| Path | Description |
|---|---|
| **/appdata/** | All of the system-specific configuration lives here (caches, logs, settings, etc.). You’ll see a variety of different files here.   |
| **/config/** | All of the .yaml configuration files Docker uses to deploy each system/combination of systems. The Docker application in my server’s GUI would usually negate the need for an “infrastructure as code” (IaC) approach, but for the purposes of making changes to the configuration and to easily re-deploy the systems in the event of a failure, everything is written manually. Each system has a sidecar “CONTAINERS.md” file to act as a key.   |
| **/scripts/** | Functions that I allow Claude Code to run on my behalf for things like error-checking, scrubbing PII, and copying down live files from my server. |

## My Systems

| System | What it does |
|---|---|
| [`docker-socket-proxy`](compose/docker-socket-proxy/) | Direct connection to various Docker containers for homepage elements |
| [`domain_infra`](compose/domain_infra/) | Caddy reverse proxy + TLS with Cloudflare's dynamic DNS, used for remote HTTPS access |
| [`glances`](compose/glances/) | System metrics that feed a dashboard widget |
| [`home-assistant`](compose/home-assistant/) | Smart-home automation |
| [`homepage`](compose/homepage/) | The status dashboard tying everything together — see its own README, deploy log, and a from-scratch study guide it generated while I was learning the stack |
| [`jellyfin`](compose/jellyfin/) | Self-hosted media server |
| [`kopia`](compose/kopia/) | Encrypted, deduplicated offsite backups to Cloudflare R2 |
| [`uptime-kuma`](compose/uptime-kuma/) | Uptime/health monitoring |
| [`vaultwarden`](compose/vaultwarden/) | Self-hosted password vault connected to a Cloudflare Tunnel for remote access |
| [`wud`](compose/wud/) | Checks every other container for available image updates |
