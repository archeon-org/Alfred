#!/usr/bin/env bash
# Quick shortcut: Ping / test connectivity to hosts
# Usage: ./scripts/ansible-ping.sh [target] [--hardened]
#
# Examples:
#   ./scripts/ansible-ping.sh                    # ping all (initial creds)
#   ./scripts/ansible-ping.sh coolify-master     # ping specific host
#   ./scripts/ansible-ping.sh all --hardened     # ping all with deploy/2222
#   ./scripts/ansible-ping.sh node-01 --hardened # ping node with deploy/2222

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

TARGET="${1:-all}"
shift 2>/dev/null || true

ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--hardened" || "$arg" == "-H" ]]; then
    ARGS+=("-e" "ansible_user=deploy" "-e" "ansible_port=2222" "-e" "ansible_ssh_private_key_file=~/.ssh/archeon_vps")
  fi
done

echo "Pinging: $TARGET"
echo ""

ansible -m ping "$TARGET" "${ARGS[@]}"
