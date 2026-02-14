# Architecture

## Overview

Archeon uses Ansible to automate VPS provisioning. The infrastructure follows a **control + node** pattern:

```
┌──────────────────┐         ┌──────────────────┐
│  Control VPS     │  SSH    │  Node VPS 1      │
│  (Coolify)       │────────>│  (apps)          │
│                  │         └──────────────────┘
│                  │         ┌──────────────────┐
│                  │  SSH    │  Node VPS 2      │
│                  │────────>│  (apps)          │
└──────────────────┘         └──────────────────┘
```

- **Control VPS** — Runs the Coolify dashboard (self-hosted PaaS). Manages deployments to nodes.
- **Node VPS** — Worker servers where apps are deployed by Coolify.

## How it works

1. You get a fresh VPS from any provider (root + password)
2. Run the Ansible playbook — it **hardens** the VPS and **installs Coolify**
3. The root password is used **once** during setup and **never stored**
4. After hardening, all access is via SSH key on port 2222

## Design principles

- **No secrets stored** — Passwords are passed as one-time extra-vars, never written to disk
- **Idempotent** — Playbooks can be re-run safely
- **Reusable** — The security role works on any Ubuntu VPS
- **SSH key only** — After hardening, password auth is disabled

## File structure

```
ansible/
├── inventory.yml              # Host definitions
├── group_vars/
│   └── all/
│       └── vars.yml           # All configuration variables
├── roles/
│   ├── security/              # VPS hardening (reusable)
│   │   ├── defaults/main.yml
│   │   ├── handlers/main.yml
│   │   ├── tasks/
│   │   │   ├── main.yml       # Task orchestrator
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
│   └── coolify/               # Docker + Coolify
│       ├── defaults/main.yml
│       ├── handlers/main.yml
│       └── tasks/
│           ├── main.yml
│           ├── docker.yml
│           └── coolify.yml
└── playbooks/
    ├── setup-control.yml      # Full setup (secure + Coolify)
    ├── secure-vps.yml         # Security hardening only
    └── install-coolify.yml    # Coolify only (post-hardening)
```

## Inventory

The inventory has two groups:

```yaml
all:
  children:
    control:     # Coolify dashboard VPS
    nodes:       # Worker nodes managed by Coolify

  vars:          # Default: deploy user, port 2222, SSH key
```

Default connection vars use hardened credentials (deploy/2222/key). During initial setup, the scripts pass `--extra-vars` to temporarily override with root/password/22.
