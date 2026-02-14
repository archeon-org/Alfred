#!/usr/bin/env bash
# Quick shortcut: Install Coolify on already-secured VPS
# Usage: ./scripts/ansible-coolify.sh [--verbose]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

ARGS=()
[[ "${1:-}" == "--verbose" || "${1:-}" == "-v" ]] && ARGS+=("-vv")

echo "══════════════════════════════════════════════"
echo "  Installing Coolify on control VPS"
echo "══════════════════════════════════════════════"
echo ""

ansible-playbook ansible/playbooks/install-coolify.yml "${ARGS[@]}"

echo ""
echo "✓ Coolify installed!"
echo "  Dashboard: http://161.97.135.50:8000"
