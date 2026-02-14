#!/usr/bin/env bash
# Quick shortcut: Remove a node from inventory
# Usage: ./scripts/ansible/ansible-remove-node.sh <node-name>
#
# Examples:
#   ./scripts/ansible/ansible-remove-node.sh node-01
#   ./scripts/ansible/ansible-remove-node.sh node-web-01
#
# This removes the node from:
#   - ansible/inventory.yml (host entry)
#
# It does NOT destroy the VPS or remove it from Coolify.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

INVENTORY="$PROJECT_ROOT/ansible/inventory.yml"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <node-name>"
  echo ""
  echo "Nodes in inventory:"
  ansible-inventory --graph 2>/dev/null \
    | grep -v '@' \
    | sed 's/.*|--//' \
    | grep -v 'coolify-master' \
    | sort -u \
    | sed 's/^/  /' || echo "  (none)"
  exit 1
fi

NODE="$1"

# Resolve IP before removing
HOST_IP=$(ansible-inventory --host "$NODE" 2>/dev/null | grep ansible_host | head -1 | awk -F'"' '{print $4}') || true

echo "══════════════════════════════════════════════"
echo "  Removing node: $NODE"
[[ -n "$HOST_IP" ]] && echo "  IP: $HOST_IP"
echo "══════════════════════════════════════════════"
echo ""

read -rp "Are you sure? This removes $NODE from inventory. [y/N] " answer
[[ ! "$answer" =~ ^[Yy]$ ]] && { echo "Cancelled."; exit 0; }

# ── Remove from inventory ──────────────────────
echo ""
echo "▶ Removing from inventory..."

in_target=0
target_indent=""
tmpfile=$(mktemp)

while IFS= read -r line; do
  if [[ "$line" =~ ^([[:space:]]+)"${NODE}": ]]; then
    in_target=1
    target_indent="${BASH_REMATCH[1]}"
    continue
  fi

  if [[ $in_target -eq 1 ]]; then
    if [[ "$line" =~ ^"${target_indent}"[[:space:]]+ ]] && [[ ! "$line" =~ ^"${target_indent}"[a-zA-Z0-9_-]+: ]]; then
      continue
    else
      in_target=0
    fi
  fi

  echo "$line" >> "$tmpfile"
done < "$INVENTORY"

mv "$tmpfile" "$INVENTORY"

# Restore empty hosts: {} if no nodes left
if ! grep -A5 'nodes:' "$INVENTORY" | grep -q '^ \{8\}[a-zA-Z]'; then
  sed -i '' '/^    nodes:/,/^    [^ ]/{s/^      hosts:.*/      hosts: {}/;}' "$INVENTORY" 2>/dev/null || true
fi

echo "✓ Removed $NODE from inventory."

echo ""
echo "✓ Node $NODE removed from Ansible!"
echo ""
echo "Don't forget to also:"
echo "  1. Remove the node from Coolify dashboard (Servers → delete)"
echo "  2. Destroy the VPS from your provider if no longer needed"
[[ -n "$HOST_IP" ]] && echo "  3. Clean known_hosts: ssh-keygen -R \"[${HOST_IP}]:2222\""
