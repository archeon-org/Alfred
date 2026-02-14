#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
#  Update Control VPS IP
# ═══════════════════════════════════════════════════
#  Updates the control VPS IP address across all files:
#  inventory, scripts, docs.
#
#  Usage:
#    ./scripts/ansible/ansible-update-control.sh
#    ./scripts/ansible/ansible-update-control.sh --ip 1.2.3.4
# ═══════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── Colors ──────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

INVENTORY="$PROJECT_ROOT/ansible/inventory.yml"

# ── Get current IP from inventory ───────────────
get_current_ip() {
  grep -A2 'coolify-master:' "$INVENTORY" | grep 'ansible_host:' | awk '{print $2}' | tr -d ' '
}

CURRENT_IP=$(get_current_ip)
NEW_IP=""

# ── Parse args ──────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip)  NEW_IP="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--ip <new-ip>]"
      echo ""
      echo "Options:"
      echo "  --ip   New IP address for the control VPS"
      echo ""
      echo "Run without args for interactive prompt."
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${BOLD}  Update Control VPS IP${NC}"
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo ""
echo -e "  Current IP: ${BOLD}${CURRENT_IP}${NC}"
echo ""

# ── Collect new IP interactively if not provided ─
if [[ -z "$NEW_IP" ]]; then
  read -rp "  $(echo -e "${CYAN}?${NC}") New IP address: " NEW_IP
fi

# ── Validate ────────────────────────────────────
if [[ -z "$NEW_IP" ]]; then
  echo -e "  ${RED}✗${NC} No IP provided."
  exit 1
fi

if [[ "$NEW_IP" == "$CURRENT_IP" ]]; then
  echo -e "  ${YELLOW}⚠${NC} IP is already ${CURRENT_IP}. Nothing to update."
  exit 0
fi

# ── Confirm ─────────────────────────────────────
echo ""
echo -e "  ${CYAN}▶${NC} IP: ${RED}${CURRENT_IP}${NC} → ${GREEN}${NEW_IP}${NC}"
echo ""
read -rp "  $(echo -e "${YELLOW}?${NC}") Apply changes? [y/N] " answer
[[ ! "$answer" =~ ^[Yy]$ ]] && { echo "  Cancelled."; exit 0; }

echo ""

# ═══════════════════════════════════════════════════
#  Update IP across all files
# ═══════════════════════════════════════════════════
echo -e "  ${CYAN}▶${NC} Updating IP: ${CURRENT_IP} → ${NEW_IP}"

# Dynamically find all files that contain the current IP
updated=0
while IFS= read -r file; do
  sed -i '' "s/${CURRENT_IP}/${NEW_IP}/g" "$file"
  echo -e "    ${GREEN}✓${NC} $(echo "$file" | sed "s|$PROJECT_ROOT/||")"
  ((updated++))
done < <(grep -rl "$CURRENT_IP" \
  "$PROJECT_ROOT/ansible/" \
  "$PROJECT_ROOT/scripts/ansible/" \
  "$PROJECT_ROOT/docs/ansible/" \
  2>/dev/null || true)

echo -e "  ${GREEN}✓${NC} Updated IP in ${updated} files."

# ── Update SSH known_hosts ──────────────────────
if ssh-keygen -F "[${CURRENT_IP}]:2222" &>/dev/null; then
  ssh-keygen -R "[${CURRENT_IP}]:2222" &>/dev/null
  echo -e "  ${GREEN}✓${NC} Removed old host key from known_hosts."
fi

# ── Update ~/.ssh/config ────────────────────────
if [[ -f "$HOME/.ssh/config" ]] && grep -q "$CURRENT_IP" "$HOME/.ssh/config"; then
  sed -i '' "s/${CURRENT_IP}/${NEW_IP}/g" "$HOME/.ssh/config"
  echo -e "  ${GREEN}✓${NC} Updated ~/.ssh/config"
fi

# ═══════════════════════════════════════════════════
#  Done
# ═══════════════════════════════════════════════════
echo ""
echo -e "  ${GREEN}✓${NC} ${BOLD}Control VPS IP updated!${NC}"
echo ""
echo -e "  Dashboard: ${BOLD}http://${NEW_IP}:8000${NC}"
echo -e "  SSH:       ${BOLD}ssh -i ~/.ssh/archeon_vps -p 2222 deploy@${NEW_IP}${NC}"
echo ""
echo -e "  ${YELLOW}⚠${NC} If this is a brand new VPS, run the setup:"
echo "    npm run ansible -- setup-control"
