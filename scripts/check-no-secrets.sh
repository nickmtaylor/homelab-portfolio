#!/bin/bash
# Blocks a commit if the staged diff contains anything that looks like a
# real secret. Heuristic, not perfect — a safety net that catches
# careless mistakes (exactly the kind this repo has already hit twice:
# real values pasted into a file meant to hold only placeholders), not a
# guarantee against a deliberate or well-disguised leak.
#
# Installed as .git/hooks/pre-commit (that file isn't itself tracked —
# see scripts/install-hooks.sh). Run it manually any time with:
#   scripts/check-no-secrets.sh
set -euo pipefail

diff_output="$(git diff --cached -U0 -- . ':!scripts/check-no-secrets.sh')"
added_lines="$(echo "$diff_output" | grep -E '^\+' | grep -Ev '^\+\+\+' || true)"

fail=0

check() {
  local pattern="$1"
  local label="$2"
  local hits
  hits="$(echo "$added_lines" | grep -E "$pattern" | grep -viE '[:=][[:space:]]*"?changeme"?[[:space:]]*$' || true)"
  if [ -n "$hits" ]; then
    echo "BLOCKED: possible $label in staged changes:"
    echo "$hits" | sed 's/^/  /'
    echo
    fail=1
  fi
}

# KEY=value / KEY: value pairs where the value isn't an obvious
# placeholder (changeme, ${VAR}, empty, or a bare URL/number) and the
# key name suggests it holds a secret.
check '\+[A-Za-z_][A-Za-z0-9_]*(KEY|TOKEN|PASSWORD|PASS|SECRET|PRIVATE)[A-Za-z0-9_]*[:=][[:space:]]*"?[^"$[:space:]{][^"[:space:]]{3,}' \
  "secret-like KEY=VALUE (not changeme/\${VAR})"

# Long hex strings (32+ chars) — typical API key shape.
check '[0-9a-f]{32,}' "long hex string (looks like an API key)"

# JWTs (three base64url segments separated by dots, starting eyJ).
check 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' "JWT"

# Known token prefixes seen in this homelab already.
check 'cfut_[A-Za-z0-9]{20,}' "Cloudflare API token"

if [ "$fail" -ne 0 ]; then
  echo "Commit blocked. If this is a genuine false positive, fix the"
  echo "pattern in scripts/check-no-secrets.sh narrowly rather than"
  echo "skipping the hook (--no-verify)."
  exit 1
fi

exit 0
