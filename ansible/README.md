# Ansible — VPS Security & Coolify Setup

Reusable Ansible playbooks for hardening VPS servers and installing [Coolify](https://coolify.io) as a self-hosted PaaS control panel.

**No vault, no secrets on disk.** Passwords are entered once at runtime and never stored.

## Architecture

```
┌──────────────────┐         ┌──────────────────┐
│  Control VPS     │  SSH    │  Node VPS 1      │
│  (Coolify)       │────────▶│  (apps)          │
│  161.97.135.50   │         └──────────────────┘
│                  │         ┌──────────────────┐
│                  │  SSH    │  Node VPS 2      │
│                  │────────▶│  (apps)          │
└──────────────────┘         └──────────────────┘
```

## Structure

```
ansible/
├── inventory.yml              # Host inventory (hardened defaults)
├── group_vars/
│   └── all/
│       └── vars.yml           # All configuration (no secrets)
├── roles/
│   ├── security/              # VPS hardening (reusable)
│   │   ├── defaults/main.yml
│   │   ├── handlers/main.yml
│   │   ├── tasks/
│   │   │   ├── main.yml       # Orchestrator
│   │   │   ├── packages.yml   # System packages
│   │   │   ├── users.yml      # Admin user + SSH key
│   │   │   ├── ssh.yml        # SSHD hardening
│   │   │   ├── firewall.yml   # UFW rules
│   │   │   ├── fail2ban.yml   # Brute-force protection
│   │   │   ├── auto-updates.yml
│   │   │   ├── kernel.yml     # Sysctl hardening
│   │   │   └── hardening.yml  # Misc hardening
│   │   └── templates/
│   │       ├── sshd_config.j2
│   │       ├── jail.local.j2
│   │       └── sysctl-hardening.conf.j2
│   └── coolify/               # Coolify + Docker
│       ├── defaults/main.yml
│       ├── handlers/main.yml
│       └── tasks/
│           ├── main.yml
│           ├── docker.yml
│           └── coolify.yml
└── playbooks/
    ├── secure-vps.yml         # Security only (reusable)
    ├── install-coolify.yml    # Coolify only (post-hardening)
    └── setup-control.yml      # Full setup (secure + coolify)
```

## Security layers

| Layer | What it does |
|-------|-------------|
| **Admin user** | Creates `deploy` user with SSH key, locks root |
| **SSH hardening** | Port 2222, key-only auth, no root login, rate limiting |
| **UFW firewall** | Deny all incoming, allow only SSH/HTTP/HTTPS |
| **Fail2ban** | Bans IPs after 3 failed SSH attempts for 1 hour |
| **Auto-updates** | Automatic security patches via unattended-upgrades |
| **Kernel hardening** | SYN flood protection, ICMP hardening, ASLR, etc. |
| **System hardening** | Core dumps disabled, cron secured, unused modules blocked |

## Quick start

### Prerequisites

- **Ansible** — `brew install ansible`
- **sshpass** — `brew install esolitos/ipa/sshpass`
- **SSH key** — `ssh-keygen -t ed25519 -f ~/.ssh/archeon_vps -C archeon-deploy-key`
- A VPS with Ubuntu 22.04+ and root password access

### 1. Setup control VPS (from zero)

```bash
npm run ansible -- setup-control
```

The script asks for the root password, then:
1. Connects as `root` on port `22` with the password
2. Hardens the VPS (creates `deploy` user, SSH key, firewall, fail2ban, etc.)
3. Installs Coolify + Docker
4. All subsequent connections use `deploy` on port `2222` with SSH key

After completion:
- **Coolify**: `http://<VPS-IP>:8000`
- **SSH**: `ssh -i ~/.ssh/archeon_vps -p 2222 deploy@<VPS-IP>`

### 2. Add a node

```bash
npm run ansible -- add-node
```

The wizard:
1. Asks for node name and IP
2. Adds the node to inventory (with hardened defaults)
3. Asks for root password
4. Hardens the node (same security as control VPS)

Then add the node in Coolify dashboard:
- **Host**: `<node-ip>` | **Port**: `2222` | **User**: `deploy`
- **SSH Key**: contents of `~/.ssh/archeon_vps`

### 3. Install Coolify only (on already-secured VPS)

```bash
npm run ansible -- coolify
```

## How passwords work

Passwords are **never stored anywhere** — no vault, no files, no environment variables.

1. Script prompts for the root password at runtime
2. Password is passed to Ansible via `--extra-vars` for one-time root connection
3. Ansible creates the `deploy` user, deploys your SSH key, disables root login + password auth
4. Password becomes useless — all future access is via SSH key only

## Variables

All configuration is in `ansible/group_vars/all/vars.yml`. See [docs/ansible/04-variables-reference.md](../docs/ansible/04-variables-reference.md) for the full list.

Key defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `admin_user` | `deploy` | Admin username |
| `ssh_port` | `2222` | SSH port after hardening |
| `admin_ssh_key_path` | `~/.ssh/archeon_vps` | Local SSH key path |
| `fail2ban_maxretry` | `3` | Failed attempts before ban |
| `server_timezone` | `UTC` | Server timezone |

## Documentation

Full docs in `docs/ansible/`:

- [01-architecture.md](../docs/ansible/01-architecture.md) — System design and file structure
- [02-security-hardening.md](../docs/ansible/02-security-hardening.md) — Security layers in detail
- [03-getting-started.md](../docs/ansible/03-getting-started.md) — Zero-to-deploy guide
- [04-variables-reference.md](../docs/ansible/04-variables-reference.md) — All variables with defaults
- [05-scripts.md](../docs/ansible/05-scripts.md) — Scripts and CLI reference
- [06-troubleshooting.md](../docs/ansible/06-troubleshooting.md) — Common issues and fixes
