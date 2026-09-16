#!/bin/bash
# Refreshes live-snapshot/compose/ from the read-only NAS mount. Only
# ever reads from /Volumes/docker — never writes there. Run this
# yourself (a Claude Code session may be blocked from running it
# directly, by design — bulk-copying files with real secrets into a new
# location is exactly the kind of action worth a manual confirmation).
set -euo pipefail

SRC="/Volumes/docker/compose"
DST="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)/live-snapshot/compose"

if [ ! -d "$SRC" ]; then
  echo "Error: $SRC not found — is the NAS's Finder share mounted?" >&2
  exit 1
fi

mkdir -p "$DST"
cp -R "$SRC/." "$DST/"
find "$DST" -name ".DS_Store" -delete

echo "Refreshed $DST from $SRC"
echo "Run scripts/diff-live.sh to see what differs from compose/."
