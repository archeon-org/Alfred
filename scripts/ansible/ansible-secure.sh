#!/usr/bin/env bash
# Quick shortcut: Secure a VPS (security hardening only)
# Usage: ./scripts/ansible-secure.sh <hostname> [--verbose] [--check]
#
# Examples:
#   ./scripts/ansible-secure.sh node-01
#   ./scripts/ansible-secure.sh node-01 --verbose
#   ./scripts/ansible-secure.sh node-01 --check    # dry run

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <hostname> [--verbose] [--check]"
  echo ""
  echo "Available hosts:"
  ansible-inventory --graph 2>/dev/null | grep -v '@' | sed 's/.*|--//' | sort -u | sed 's/^/  /'
  exit 1
fi

TARGET="$1"
shift

ARGS=("--limit" "$TARGET")
for arg in "$@"; do
  case "$arg" in
    --verbose|-v) ARGS+=("-vv") ;;
    --check|--dry-run) ARGS+=("--check") ;;
  esac
done

echo "══════════════════════════════════════════════"
echo "  Securing VPS: $TARGET"
echo "══════════════════════════════════════════════"
echo ""

ansible-playbook ansible/playbooks/secure-vps.yml "${ARGS[@]}"

echo ""
echo "✓ VPS secured!"
echo "  SSH: ssh -i ~/.ssh/archeon_vps -p 2222 deploy@<IP>"
