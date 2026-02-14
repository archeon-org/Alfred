#!/usr/bin/env bash
# Quick shortcut: Setup control VPS (security + Coolify)
# Usage: ./scripts/ansible-setup-control.sh [--verbose]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

ARGS=()
[[ "${1:-}" == "--verbose" || "${1:-}" == "-v" ]] && ARGS+=("-vv")

echo "══════════════════════════════════════════════"
echo "  Setting up control VPS (security + Coolify)"
echo "══════════════════════════════════════════════"
echo ""

read -rsp "Root password for the VPS (used once, not stored): " INIT_PASS
echo ""
[[ -z "$INIT_PASS" ]] && { echo "Error: Password required."; exit 1; }

echo ""
ansible-playbook ansible/playbooks/setup-control.yml -e "initial_password=${INIT_PASS}" "${ARGS[@]}"

echo ""
echo "✓ Control VPS ready!"
echo "  Dashboard: http://161.97.135.50:8000"
echo "  SSH: ssh -i ~/.ssh/archeon_vps -p 2222 deploy@161.97.135.50"
