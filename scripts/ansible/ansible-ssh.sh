#!/usr/bin/env bash
# Quick shortcut: SSH into a VPS
# Usage: ./scripts/ansible-ssh.sh <hostname> [--initial]
#
# Examples:
#   ./scripts/ansible-ssh.sh coolify-master            # SSH as deploy (hardened)
#   ./scripts/ansible-ssh.sh node-01                   # SSH as deploy (hardened)
#   ./scripts/ansible-ssh.sh coolify-master --initial   # SSH as root (initial)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <hostname> [--initial]"
  echo ""
  echo "Available hosts:"
  ansible-inventory --graph 2>/dev/null | grep -v '@' | sed 's/.*|--//' | sort -u | sed 's/^/  /'
  exit 1
fi

TARGET="$1"
MODE="${2:-}"

# Resolve IP from inventory
HOST_IP=$(ansible-inventory --host "$TARGET" 2>/dev/null | grep ansible_host | head -1 | awk -F'"' '{print $4}')
[[ -z "$HOST_IP" ]] && { echo "Error: Could not resolve IP for $TARGET."; exit 1; }

if [[ "$MODE" == "--initial" || "$MODE" == "-i" ]]; then
  read -rsp "Root password: " PASS
  echo ""
  echo "Connecting as root to ${HOST_IP}:22..."
  sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no "root@${HOST_IP}"
else
  echo "Connecting as deploy to ${HOST_IP}:2222..."
  ssh -i ~/.ssh/archeon_vps -p 2222 -o StrictHostKeyChecking=no "deploy@${HOST_IP}"
fi
