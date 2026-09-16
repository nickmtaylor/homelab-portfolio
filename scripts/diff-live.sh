#!/bin/bash
# Shows what differs between this repo's intended config and what's
# actually deployed on the NAS, per the last live-snapshot refresh.
# Run scripts/refresh-live-snapshot.sh first if it's stale.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [ ! -d live-snapshot/compose ]; then
  echo "live-snapshot/compose/ doesn't exist yet — run scripts/refresh-live-snapshot.sh first." >&2
  exit 1
fi

diff -rq compose/ live-snapshot/compose/ || true
