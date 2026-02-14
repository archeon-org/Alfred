#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
#  Archeon — Ansible Operations Runner
# ═══════════════════════════════════════════════════
#  Interactive menu for running Ansible playbooks.
#  Run from the project root: ./scripts/ansible/ansible.sh
# ═══════════════════════════════════════════════════

set -euo pipefail

# ── Colors ──────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# ── Project root (resolve from script location) ─
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PLAYBOOKS_DIR="$PROJECT_ROOT/ansible/playbooks"
INVENTORY="$PROJECT_ROOT/ansible/inventory.yml"

# ── Helpers ─────────────────────────────────────
print_header() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════${NC}"
  echo -e "${BOLD}  $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════${NC}"
  echo ""
}

print_step() {
  echo -e "  ${CYAN}▶${NC} $1"
}

print_success() {
  echo -e "  ${GREEN}✓${NC} $1"
}

print_warning() {
  echo -e "  ${YELLOW}⚠${NC} $1"
}

print_error() {
  echo -e "  ${RED}✗${NC} $1"
}

confirm() {
  local msg="${1:-Continue?}"
  echo ""
  read -rp "  $(echo -e "${YELLOW}?${NC}") $msg [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

# ── Preflight checks ───────────────────────────
preflight() {
  local missing=0

  if ! command -v ansible-playbook &>/dev/null; then
    print_error "ansible-playbook not found. Install: brew install ansible"
    missing=1
  fi

  if ! command -v sshpass &>/dev/null; then
    print_warning "sshpass not found (needed for initial password-based connections)"
    print_warning "Install: brew install esolitos/ipa/sshpass"
  fi

  if [[ ! -f "$HOME/.ssh/archeon_vps" ]]; then
    print_warning "SSH key not found: ~/.ssh/archeon_vps"
    print_warning "Generate: ssh-keygen -t ed25519 -f ~/.ssh/archeon_vps -C archeon-deploy-key"
  fi

  if [[ $missing -eq 1 ]]; then
    echo ""
    print_error "Fix the issues above before continuing."
    exit 1
  fi
}

# ── Get hosts from inventory ────────────────────
get_hosts() {
  cd "$PROJECT_ROOT"
  ansible-inventory --graph 2>/dev/null | grep -v '@' | sed 's/.*|--//' | sort -u 2>/dev/null || echo "coolify-master"
}

# ── Run a playbook ──────────────────────────────
run_playbook() {
  local playbook="$1"
  shift
  local extra_args=("$@")

  cd "$PROJECT_ROOT"

  echo ""
  print_step "Running: ansible-playbook $playbook ${extra_args[*]:-}"
  echo ""

  ansible-playbook "$playbook" "${extra_args[@]}" && {
    echo ""
    print_success "Playbook completed successfully!"
  } || {
    echo ""
    print_error "Playbook failed. Check the output above for details."
    exit 1
  }
}

# ═══════════════════════════════════════════════════
#  Actions
# ═══════════════════════════════════════════════════

# ── 1. Setup Control VPS ───────────────────────
action_setup_control() {
  print_header "Setup Control VPS (Security + Coolify)"

  print_step "This will:"
  echo "    1. Connect as root with password (used once, not stored)"
  echo "    2. Harden the VPS (firewall, SSH, fail2ban, etc.)"
  echo "    3. Install Docker + Coolify"
  echo ""
  print_warning "Only run this on a FRESH VPS! It will change SSH port to 2222."

  read -rsp "  $(echo -e "${CYAN}?${NC}") Root password for the VPS: " init_pass
  echo ""
  [[ -z "$init_pass" ]] && { print_error "Password required."; return 1; }

  if confirm "Run full control VPS setup?"; then
    local extra_args=()

    read -rp "  $(echo -e "${CYAN}?${NC}") Verbose output? (y/N) " verbose
    [[ "$verbose" =~ ^[Yy]$ ]] && extra_args+=("-vv")

    run_playbook "$PLAYBOOKS_DIR/setup-control.yml" -e "initial_password=${init_pass}" "${extra_args[@]}"

    echo ""
    print_success "Control VPS is ready!"
    echo -e "    Dashboard: ${BOLD}http://161.97.135.50:8000${NC}"
    echo -e "    SSH:       ${BOLD}ssh -i ~/.ssh/archeon_vps -p 2222 deploy@161.97.135.50${NC}"
  fi
}

# ── 2. Secure a VPS ────────────────────────────
action_secure_vps() {
  print_header "Secure a VPS (Security Hardening Only)"

  print_step "Available hosts in inventory:"
  echo ""

  # List hosts
  local hosts
  hosts=$(get_hosts)
  local i=1
  local host_array=()
  while IFS= read -r host; do
    [[ -z "$host" ]] && continue
    echo "    ${i}) $host"
    host_array+=("$host")
    ((i++))
  done <<< "$hosts"
  echo "    ${i}) ALL hosts"
  echo "    $((i+1))) Enter hostname manually"

  echo ""
  read -rp "  $(echo -e "${CYAN}?${NC}") Select host number: " choice

  local target=""
  if [[ "$choice" =~ ^[0-9]+$ ]]; then
    if [[ $choice -eq $i ]]; then
      target="all"
    elif [[ $choice -eq $((i+1)) ]]; then
      read -rp "  $(echo -e "${CYAN}?${NC}") Enter hostname: " target
    elif [[ $choice -ge 1 && $choice -lt $i ]]; then
      target="${host_array[$((choice-1))]}"
    fi
  fi

  if [[ -z "$target" ]]; then
    print_error "Invalid selection."
    return 1
  fi

  echo ""
  print_step "Target: ${BOLD}$target${NC}"
  print_step "This will: harden SSH, setup firewall, fail2ban, auto-updates, etc."
  print_warning "SSH port will change from 22 → 2222. Make sure this is a fresh VPS."

  read -rsp "  $(echo -e "${CYAN}?${NC}") Root password (used once, not stored): " init_pass
  echo ""
  [[ -z "$init_pass" ]] && { print_error "Password required."; return 1; }

  if confirm "Secure ${target}?"; then
    local extra_args=()

    if [[ "$target" != "all" ]]; then
      extra_args+=("--limit" "$target")
    fi

    extra_args+=("-e" "ansible_user=root" "-e" "ansible_port=22" "-e" "ansible_password=${init_pass}" "-e" "ansible_ssh_private_key_file=")

    read -rp "  $(echo -e "${CYAN}?${NC}") Verbose output? (y/N) " verbose
    [[ "$verbose" =~ ^[Yy]$ ]] && extra_args+=("-vv")

    run_playbook "$PLAYBOOKS_DIR/secure-vps.yml" "${extra_args[@]}"

    echo ""
    print_success "VPS secured!"
    echo -e "    SSH: ${BOLD}ssh -i ~/.ssh/archeon_vps -p 2222 deploy@<IP>${NC}"
  fi
}

# ── 3. Install Coolify ─────────────────────────
action_install_coolify() {
  print_header "Install Coolify (on already-secured VPS)"

  print_step "This will install Docker + Coolify on the control VPS."
  print_warning "The VPS must already be secured (deploy user, port 2222, SSH key)."

  if confirm "Install Coolify on control VPS?"; then
    local extra_args=()

    read -rp "  $(echo -e "${CYAN}?${NC}") Verbose output? (y/N) " verbose
    [[ "$verbose" =~ ^[Yy]$ ]] && extra_args+=("-vv")

    run_playbook "$PLAYBOOKS_DIR/install-coolify.yml" "${extra_args[@]}"

    echo ""
    print_success "Coolify installed!"
    echo -e "    Dashboard: ${BOLD}http://161.97.135.50:8000${NC}"
  fi
}

# ── 4. Add a new node ──────────────────────────
action_add_node() {
  print_header "Add a New Node VPS"

  print_step "This wizard will:"
  echo "    1. Add the node to the inventory (with hardened creds)"
  echo "    2. Run the security playbook (using root password once)"
  echo "    3. Password is NOT stored — it's only needed for the initial run"
  echo ""

  # Collect info
  read -rp "  $(echo -e "${CYAN}?${NC}") Node name (e.g., node-01, node-web-01): " node_name
  [[ -z "$node_name" ]] && { print_error "Node name required."; return 1; }

  read -rp "  $(echo -e "${CYAN}?${NC}") Node IP address: " node_ip
  [[ -z "$node_ip" ]] && { print_error "IP address required."; return 1; }

  read -rsp "  $(echo -e "${CYAN}?${NC}") Root password (used once, not stored): " node_pass
  echo ""
  [[ -z "$node_pass" ]] && { print_error "Password required."; return 1; }

  echo ""
  print_step "Summary:"
  echo "    Name: $node_name"
  echo "    IP:   $node_ip"
  echo "    Password will be used once and discarded."

  if confirm "Add node and run security playbook?"; then
    # Step 1: Add to inventory using Python (reliable across macOS/Linux)
    print_step "Adding node to inventory..."

    python3 -c "
import sys, re

with open('$INVENTORY', 'r') as f:
    content = f.read()

node_name = '$node_name'
node_ip = '$node_ip'

# Check if node already exists
if re.search(r'^\s+' + re.escape(node_name) + r':', content, re.MULTILINE):
    print(f'Node {node_name} already exists in inventory — skipping add.')
    sys.exit(0)

# Replace 'hosts: {}' under nodes with the new node
if 'nodes:' in content:
    # Case 1: empty hosts: {}
    content = content.replace(
        'hosts: {}',
        'hosts:\n        ' + node_name + ':\n          ansible_host: ' + node_ip,
        1  # only replace first occurrence... but nodes is the only one with {}
    )
    # Case 2: hosts already has entries — append after last node entry under nodes
    if node_name + ':' not in content:
        # Find the nodes hosts section and append
        lines = content.split('\n')
        new_lines = []
        in_nodes = False
        in_hosts = False
        inserted = False
        for i, line in enumerate(lines):
            new_lines.append(line)
            if 'nodes:' in line and not inserted:
                in_nodes = True
                continue
            if in_nodes and 'hosts:' in line:
                in_hosts = True
                continue
            if in_nodes and in_hosts and not inserted:
                # Check if next line exits the hosts block (less indented or empty section)
                next_line = lines[i + 1] if i + 1 < len(lines) else ''
                current_indent = len(line) - len(line.lstrip())
                next_indent = len(next_line) - len(next_line.lstrip()) if next_line.strip() else 0
                if next_indent <= 4 or next_line.strip() == '' or i + 1 >= len(lines):
                    new_lines.append('        ' + node_name + ':')
                    new_lines.append('          ansible_host: ' + node_ip)
                    inserted = True
                    in_nodes = False
                    in_hosts = False
        if inserted:
            content = '\n'.join(new_lines)

with open('$INVENTORY', 'w') as f:
    f.write(content)

print('OK')
" 2>&1

    if [[ $? -ne 0 ]]; then
      print_warning "Could not auto-add to inventory. Add manually under nodes > hosts:"
      echo ""
      echo "        ${node_name}:"
      echo "          ansible_host: ${node_ip}"
      echo ""
    else
      print_success "Node added to inventory"
    fi

    # Step 2: Test connectivity with root password
    print_step "Testing connectivity..."
    if sshpass -p "$node_pass" ssh \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null \
      -o ConnectTimeout=10 \
      "root@${node_ip}" echo "OK" 2>/dev/null; then
      print_success "Node is reachable!"
    else
      print_error "Cannot reach ${node_ip} via SSH. Check the IP and password."
      return 1
    fi

    # Step 3: Run security playbook with root creds as extra-vars (one-time)
    print_step "Running security playbook on ${node_name}..."
    echo ""

    run_playbook "$PLAYBOOKS_DIR/secure-vps.yml" \
      --limit "$node_name" \
      -e "ansible_user=root" \
      -e "ansible_port=22" \
      -e "ansible_password=${node_pass}" \
      -e "ansible_ssh_private_key_file="

    echo ""
    print_success "Node ${node_name} is secured!"
    echo ""
    echo -e "  ${BOLD}Connection:${NC}"
    echo "    ssh -i ~/.ssh/archeon_vps -p 2222 deploy@${node_ip}"
    echo ""
    echo -e "  ${BOLD}Add to Coolify dashboard:${NC}"
    echo "    Host: ${node_ip}"
    echo "    Port: 2222"
    echo "    User: deploy"
    echo "    Key:  contents of ~/.ssh/archeon_vps"
  fi
}

# ── 5. Test connectivity ───────────────────────
action_ping() {
  print_header "Test Connectivity (Ping)"

  echo "  1) All hosts"
  echo "  2) Control VPS only"
  echo "  3) Nodes only"
  echo "  4) Specific host"

  echo ""
  read -rp "  $(echo -e "${CYAN}?${NC}") Select: " choice

  local target=""
  local extra_args=()

  case "$choice" in
    1) target="all" ;;
    2) target="control" ;;
    3) target="nodes" ;;
    4)
      read -rp "  $(echo -e "${CYAN}?${NC}") Enter hostname: " target
      ;;
  esac

  [[ -z "$target" ]] && { print_error "Invalid selection."; return 1; }

  # Ask if connecting with hardened or initial credentials
  echo ""
  echo "  Connection type:"
  echo "    1) Initial (root + password, port 22)"
  echo "    2) Hardened (deploy + SSH key, port 2222)"
  echo ""
  read -rp "  $(echo -e "${CYAN}?${NC}") Select: " conn_type

  if [[ "$conn_type" == "2" ]]; then
    extra_args+=("-e" "ansible_user=deploy" "-e" "ansible_port=2222" "-e" "ansible_ssh_private_key_file=~/.ssh/archeon_vps")
  fi

  echo ""
  print_step "Pinging ${target}..."
  echo ""

  cd "$PROJECT_ROOT"
  ansible -m ping "$target" "${extra_args[@]}" && {
    echo ""
    print_success "All hosts reachable!"
  } || {
    echo ""
    print_error "Some hosts unreachable. Check output above."
  }
}

# ── 6. Remove a node ───────────────────────────
action_remove_node() {
  print_header "Remove a Node VPS"

  # List only node hosts (exclude coolify-master)
  local hosts
  hosts=$(get_hosts)
  local host_array=()
  local i=1

  print_step "Nodes in inventory:"
  echo ""

  while IFS= read -r host; do
    [[ -z "$host" ]] && continue
    [[ "$host" == "coolify-master" ]] && continue
    echo "    ${i}) $host"
    host_array+=("$host")
    ((i++))
  done <<< "$hosts"

  if [[ ${#host_array[@]} -eq 0 ]]; then
    print_warning "No nodes found in inventory (only the control VPS exists)."
    return 0
  fi

  echo ""
  read -rp "  $(echo -e "${CYAN}?${NC}") Select node to remove: " choice

  local target=""
  if [[ "$choice" =~ ^[0-9]+$ ]] && [[ $choice -ge 1 && $choice -lt $i ]]; then
    target="${host_array[$((choice-1))]}"
  else
    print_error "Invalid selection."
    return 1
  fi

  # Resolve IP
  local host_ip
  host_ip=$(cd "$PROJECT_ROOT" && ansible-inventory --host "$target" 2>/dev/null | grep ansible_host | head -1 | awk -F'"' '{print $4}') || true

  echo ""
  print_step "Node to remove: ${BOLD}${target}${NC}"
  [[ -n "$host_ip" ]] && print_step "IP: ${host_ip}"
  echo ""
  print_warning "This will:"
  echo "    - Remove the node from ansible/inventory.yml"
  echo ""
  print_warning "This will NOT:"
  echo "    - Destroy the VPS (do that from your provider's dashboard)"
  echo "    - Remove the node from Coolify (do that from the Coolify dashboard)"

  if confirm "Remove ${target} from inventory?"; then

    # ── Remove from inventory ──────────────────
    print_step "Removing from inventory..."

    # Build a temp file without the node block
    local in_target=0
    local target_indent=""
    local tmpfile
    tmpfile=$(mktemp)

    while IFS= read -r line; do
      # Detect the start of the target node block
      if [[ "$line" =~ ^([[:space:]]+)"${target}": ]]; then
        in_target=1
        target_indent="${BASH_REMATCH[1]}"
        continue
      fi

      # If we're inside the target block, skip indented lines
      if [[ $in_target -eq 1 ]]; then
        # Check if line is more indented than the node name (it's a property of this node)
        if [[ "$line" =~ ^"${target_indent}"[[:space:]]+ ]] && [[ ! "$line" =~ ^"${target_indent}"[a-zA-Z0-9_-]+: ]]; then
          continue
        else
          in_target=0
        fi
      fi

      echo "$line" >> "$tmpfile"
    done < "$INVENTORY"

    mv "$tmpfile" "$INVENTORY"

    # If no more nodes, restore the empty hosts: {} line
    if ! grep -A5 'nodes:' "$INVENTORY" | grep -q '^ \{8\}[a-zA-Z]'; then
      sed -i '' '/^    nodes:/,/^    [^ ]/{s/^      hosts:.*/      hosts: {}/;}' "$INVENTORY" 2>/dev/null || true
    fi

    print_success "Removed ${target} from inventory."

    echo ""
    print_success "Node ${target} removed from Ansible!"
    echo ""
    echo -e "  ${BOLD}Don't forget to also:${NC}"
    echo "    1. Remove the node from the Coolify dashboard (Servers → delete)"
    echo "    2. Destroy the VPS from your provider if no longer needed"
    [[ -n "$host_ip" ]] && echo "    3. Clean known_hosts: ssh-keygen -R \"[${host_ip}]:2222\""
  fi
}

# ── 8. Check VPS status ────────────────────────
action_status() {
  print_header "Check VPS Status"

  local hosts
  hosts=$(get_hosts)
  local host_array=()
  local i=1

  while IFS= read -r host; do
    [[ -z "$host" ]] && continue
    echo "    ${i}) $host"
    host_array+=("$host")
    ((i++))
  done <<< "$hosts"

  echo ""
  read -rp "  $(echo -e "${CYAN}?${NC}") Select host: " choice

  local target=""
  if [[ "$choice" =~ ^[0-9]+$ ]] && [[ $choice -ge 1 && $choice -lt $i ]]; then
    target="${host_array[$((choice-1))]}"
  else
    print_error "Invalid selection."
    return 1
  fi

  # Get the host IP
  local host_ip
  host_ip=$(cd "$PROJECT_ROOT" && ansible-inventory --host "$target" 2>/dev/null | grep ansible_host | head -1 | awk -F'"' '{print $4}')
  [[ -z "$host_ip" ]] && { print_error "Could not resolve IP for $target."; return 1; }

  echo ""
  print_step "Checking status of ${target} (${host_ip})..."
  echo ""

  local ssh_cmd="ssh -i ~/.ssh/archeon_vps -p 2222 -o StrictHostKeyChecking=no -o ConnectTimeout=10 deploy@${host_ip}"

  # System info
  echo -e "${BOLD}  System:${NC}"
  $ssh_cmd "hostname && uptime && echo '' && free -h | head -2 && echo '' && df -h / | tail -1" 2>/dev/null || {
    print_error "Cannot connect to $target. Trying initial credentials..."
    print_warning "Cannot connect with hardened creds. VPS may not be secured yet."
    print_warning "Use 'SSH into a VPS' → 'Initial' mode to connect as root."
    return 1
  }

  echo ""

  # Docker
  echo -e "${BOLD}  Docker:${NC}"
  $ssh_cmd "docker --version 2>/dev/null && docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | head -20" 2>/dev/null || echo "    Docker not installed"

  echo ""

  # Firewall
  echo -e "${BOLD}  Firewall:${NC}"
  $ssh_cmd "sudo ufw status 2>/dev/null | head -15" 2>/dev/null || echo "    UFW not available"

  echo ""

  # Fail2ban
  echo -e "${BOLD}  Fail2ban:${NC}"
  $ssh_cmd "sudo fail2ban-client status sshd 2>/dev/null" 2>/dev/null || echo "    Fail2ban not available"
}

# ── 8. SSH into a VPS ──────────────────────────
action_ssh() {
  print_header "SSH into a VPS"

  local hosts
  hosts=$(get_hosts)
  local host_array=()
  local i=1

  while IFS= read -r host; do
    [[ -z "$host" ]] && continue
    echo "    ${i}) $host"
    host_array+=("$host")
    ((i++))
  done <<< "$hosts"

  echo ""
  read -rp "  $(echo -e "${CYAN}?${NC}") Select host: " choice

  local target=""
  if [[ "$choice" =~ ^[0-9]+$ ]] && [[ $choice -ge 1 && $choice -lt $i ]]; then
    target="${host_array[$((choice-1))]}"
  else
    print_error "Invalid selection."
    return 1
  fi

  local host_ip
  host_ip=$(cd "$PROJECT_ROOT" && ansible-inventory --host "$target" 2>/dev/null | grep ansible_host | head -1 | awk -F'"' '{print $4}')
  [[ -z "$host_ip" ]] && { print_error "Could not resolve IP for $target."; return 1; }

  echo ""
  echo "  Connection type:"
  echo "    1) Hardened (deploy + SSH key, port 2222) — default"
  echo "    2) Initial (root + password, port 22)"
  echo ""
  read -rp "  $(echo -e "${CYAN}?${NC}") Select [1]: " conn_type
  conn_type="${conn_type:-1}"

  echo ""
  if [[ "$conn_type" == "2" ]]; then
    read -rsp "  $(echo -e "${CYAN}?${NC}") Root password: " root_pass
    echo ""
    print_step "Connecting as root to ${host_ip}:22..."
    sshpass -p "$root_pass" \
      ssh -o StrictHostKeyChecking=no "root@${host_ip}"
  else
    print_step "Connecting as deploy to ${host_ip}:2222..."
    ssh -i ~/.ssh/archeon_vps -p 2222 -o StrictHostKeyChecking=no "deploy@${host_ip}"
  fi
}

# ── 9. Run custom playbook ─────────────────────
action_custom() {
  print_header "Run Custom Playbook"

  print_step "Available playbooks:"
  echo ""
  local i=1
  local pb_array=()
  for pb in "$PLAYBOOKS_DIR"/*.yml; do
    local name
    name=$(basename "$pb")
    echo "    ${i}) $name"
    pb_array+=("$pb")
    ((i++))
  done

  echo ""
  read -rp "  $(echo -e "${CYAN}?${NC}") Select playbook: " choice

  local playbook=""
  if [[ "$choice" =~ ^[0-9]+$ ]] && [[ $choice -ge 1 && $choice -lt $i ]]; then
    playbook="${pb_array[$((choice-1))]}"
  else
    print_error "Invalid selection."
    return 1
  fi

  local extra_args=()

  # Limit
  read -rp "  $(echo -e "${CYAN}?${NC}") Limit to host (leave empty for all): " limit
  [[ -n "$limit" ]] && extra_args+=("--limit" "$limit")

  # Extra vars
  read -rp "  $(echo -e "${CYAN}?${NC}") Extra vars (e.g., ssh_port=3333, leave empty for none): " extra_vars
  [[ -n "$extra_vars" ]] && extra_args+=("-e" "$extra_vars")

  # Verbose
  read -rp "  $(echo -e "${CYAN}?${NC}") Verbose output? (y/N) " verbose
  [[ "$verbose" =~ ^[Yy]$ ]] && extra_args+=("-vv")

  # Dry run
  read -rp "  $(echo -e "${CYAN}?${NC}") Dry run (check mode)? (y/N) " dryrun
  [[ "$dryrun" =~ ^[Yy]$ ]] && extra_args+=("--check")

  echo ""
  print_step "Playbook: $(basename "$playbook")"
  [[ -n "$limit" ]] && print_step "Limit: $limit"
  [[ -n "$extra_vars" ]] && print_step "Extra vars: $extra_vars"

  if confirm "Run playbook?"; then
    run_playbook "$playbook" "${extra_args[@]}"
  fi
}

# ═══════════════════════════════════════════════════
#  Main Menu
# ═══════════════════════════════════════════════════

# ── 11. Update control VPS details ─────────────
action_update_control() {
  "$SCRIPT_DIR/ansible-update-control.sh"
}

show_menu() {
  print_header "Archeon — Ansible Operations"

  echo -e "  ${BOLD}Setup & Provisioning${NC}"
  echo "    1) Setup control VPS    (security + Coolify — full initial setup)"
  echo "    2) Secure a VPS         (security hardening only — reusable)"
  echo "    3) Install Coolify      (Docker + Coolify on already-secured VPS)"
  echo "    4) Add a new node       (guided wizard: inventory + secure)"
  echo "    5) Remove a node        (remove from inventory)"
  echo ""
  echo -e "  ${BOLD}Operations${NC}"
  echo "    6) Test connectivity    (ping hosts)"
  echo "    7) Check VPS status     (system, Docker, firewall, fail2ban)"
  echo "    8) SSH into a VPS       (quick connect)"
  echo ""
  echo -e "  ${BOLD}Management${NC}"
  echo "    9) Update control VPS   (change IP)"
  echo "   10) Run custom playbook  (advanced, with options)"
  echo ""
  echo "    0) Exit"
  echo ""
}

# ── CLI mode (direct command) ───────────────────
if [[ $# -gt 0 ]]; then
  preflight

  case "$1" in
    setup-control|setup)     action_setup_control ;;
    secure|secure-vps)       action_secure_vps ;;
    coolify|install-coolify) action_install_coolify ;;
    add-node|node)           action_add_node ;;
    remove-node|rm-node)     action_remove_node ;;
    update-control|update)   action_update_control ;;
    ping|test)               action_ping ;;
    status)                  action_status ;;
    ssh|connect)             action_ssh ;;
    custom|run)              action_custom ;;
    help|--help|-h)
      echo "Usage: $0 [command]"
      echo ""
      echo "Commands:"
      echo "  setup-control   Full control VPS setup (security + Coolify)"
      echo "  secure          Secure a VPS (security hardening only)"
      echo "  coolify         Install Coolify on already-secured VPS"
      echo "  add-node        Guided wizard to add a new node"
      echo "  remove-node     Remove a node from inventory"
      echo "  update-control  Update control VPS IP"
      echo "  ping            Test connectivity to hosts"
      echo "  status          Check VPS status (system, Docker, firewall)"
      echo "  ssh             SSH into a VPS"
      echo "  custom          Run a custom playbook with options"
      echo ""
      echo "Run without arguments for interactive menu."
      ;;
    *)
      print_error "Unknown command: $1"
      echo "Run '$0 --help' for usage."
      exit 1
      ;;
  esac
  exit 0
fi

# ── Interactive mode ────────────────────────────
preflight

while true; do
  show_menu
  read -rp "  $(echo -e "${CYAN}?${NC}") Select an option: " option

  case "$option" in
    1) action_setup_control ;;
    2) action_secure_vps ;;
    3) action_install_coolify ;;
    4) action_add_node ;;
    5) action_remove_node ;;
    6) action_ping ;;
    7) action_status ;;
    8) action_ssh ;;
    9) action_update_control ;;
    10) action_custom ;;
    0)
      echo ""
      print_success "Bye!"
      exit 0
      ;;
    *)
      print_error "Invalid option. Try again."
      ;;
  esac

  echo ""
  read -rp "  Press Enter to return to menu..." _
done
