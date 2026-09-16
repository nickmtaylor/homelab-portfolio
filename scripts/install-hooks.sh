#!/bin/bash
# Run once after cloning this repo fresh (git hooks live in .git/hooks/,
# which git itself never tracks or transfers on clone).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

cat > .git/hooks/pre-commit <<'HOOK'
#!/bin/bash
exec scripts/check-no-secrets.sh
HOOK
chmod +x .git/hooks/pre-commit

echo "Installed: .git/hooks/pre-commit -> scripts/check-no-secrets.sh"
