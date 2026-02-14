# Scripts Reference

All scripts are in `scripts/ansible/`. They can be run directly or via `npm run ansible`.

## Main script — `ansible.sh`

The interactive hub for all Ansible operations. Supports both **menu mode** and **CLI mode**.

### Interactive menu

```bash
npm run ansible
# or
./scripts/ansible/ansible.sh
```

Menu options:

| # | Action | Description |
|---|--------|-------------|
| 1 | Setup control VPS | Full setup: security hardening + Coolify install |
| 2 | Secure a VPS | Security hardening only (any host) |
| 3 | Install Coolify | Coolify on already-secured VPS |
| 4 | Add a node | Guided wizard to register + harden new node |
| 5 | Remove a node | Remove node from inventory |
| 6 | Ping hosts | Test connectivity |
| 7 | Check VPS status | System, Docker, firewall, fail2ban |
| 8 | SSH into a VPS | Quick connect (initial or hardened) |
| 9 | Update control VPS | Change the control VPS IP |
| 10 | Run custom playbook | Run any playbook with options |

### CLI mode

```bash
npm run ansible -- setup-control
npm run ansible -- secure
npm run ansible -- coolify
npm run ansible -- add-node
npm run ansible -- remove-node
npm run ansible -- update-control
npm run ansible -- ping
npm run ansible -- status
npm run ansible -- ssh
npm run ansible -- custom
npm run ansible -- help
```

## Standalone scripts

Each major action has a standalone shortcut script. These are thin wrappers that do one thing.

### `ansible-setup-control.sh`

Full control VPS setup (security + Coolify). Asks for root password, passes it as an extra-var.

```bash
./scripts/ansible/ansible-setup-control.sh
./scripts/ansible/ansible-setup-control.sh --verbose
```

### `ansible-secure.sh`

Secure a specific host. Asks for root password to connect, then hardens the VPS.

```bash
./scripts/ansible/ansible-secure.sh node-01
./scripts/ansible/ansible-secure.sh node-01 --verbose
./scripts/ansible/ansible-secure.sh node-01 --check   # dry run
```

### `ansible-coolify.sh`

Install Coolify on an already-secured VPS.

```bash
./scripts/ansible/ansible-coolify.sh
./scripts/ansible/ansible-coolify.sh --verbose
```

### `ansible-ping.sh`

Test connectivity to hosts.

```bash
./scripts/ansible/ansible-ping.sh              # all hosts
./scripts/ansible/ansible-ping.sh node-01      # specific host
./scripts/ansible/ansible-ping.sh --hardened   # all via deploy@2222
```

### `ansible-ssh.sh`

Quick SSH into any VPS.

```bash
./scripts/ansible/ansible-ssh.sh coolify-master           # hardened (deploy@2222)
./scripts/ansible/ansible-ssh.sh coolify-master --initial  # initial (root@22, asks password)
```

### `ansible-remove-node.sh`

Remove a node from inventory.

```bash
./scripts/ansible/ansible-remove-node.sh node-01
```

### `ansible-update-control.sh`

Update the control VPS IP across all config files (inventory, docs, etc.).

```bash
./scripts/ansible/ansible-update-control.sh
```

## How passwords work

Passwords are **never stored**. They are:

1. Asked once at runtime (interactive prompt)
2. Passed to Ansible via `--extra-vars` for one-time SSH connection as root
3. After hardening, root login and password auth are disabled
4. All subsequent connections use the `deploy` user + SSH key on port 2222

This means:
- No vault files to manage
- No secrets on disk
- Password is only needed once per VPS, during initial setup
