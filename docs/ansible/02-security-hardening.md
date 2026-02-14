# Security Hardening

## What the security role does

The `security` role applies 8 layers of hardening to any fresh Ubuntu VPS:

| Layer | What it does |
|-------|-------------|
| **Packages** | Updates system, installs essential tools (ufw, fail2ban, etc.) |
| **Admin user** | Creates `deploy` user with sudo, copies SSH public key, locks root |
| **SSH** | Port 2222, key-only auth, no root login, rate limiting, strong ciphers |
| **Firewall** | UFW: deny all, allow SSH(2222)/HTTP(80)/HTTPS(443) only |
| **Fail2ban** | Bans IPs after 3 failed SSH attempts for 1 hour |
| **Auto-updates** | Automatic security patches via unattended-upgrades |
| **Kernel** | Sysctl hardening: SYN flood protection, ICMP, ASLR, source routing |
| **Hardening** | Core dumps disabled, cron secured, unused modules blocked |

## Task execution order

The order is critical — SSH hardening runs **before** the firewall to avoid lockout:

```
1. packages.yml    → apt update, install tools
2. users.yml       → create deploy user, copy SSH key
3. ssh.yml         → change port to 2222, restart SSH, wait for new port
4. firewall.yml    → UFW rules (port 22 blocked, 2222 allowed)
5. fail2ban.yml    → brute-force protection
6. auto-updates.yml → unattended-upgrades
7. kernel.yml      → sysctl params
8. hardening.yml   → misc security
```

## SSH hardening details

The SSH task:
1. Deploys a hardened `sshd_config` (from template)
2. Restarts SSH **inline** (not via handler — ensures immediate effect)
3. Waits for port 2222 to be reachable
4. Updates `ansible_port` mid-play via `set_fact`

This prevents the lockout scenario where port 22 gets blocked by the firewall before SSH has switched to 2222.

## After hardening

```
Before                          After
─────────────────               ─────────────────
User: root                      User: deploy (sudo)
Port: 22                        Port: 2222
Auth: password                  Auth: SSH key only
Firewall: none                  Firewall: UFW (deny all)
Protection: none                Protection: fail2ban
Updates: manual                 Updates: automatic
```

Connect after hardening:
```bash
ssh -i ~/.ssh/archeon_vps -p 2222 deploy@<IP>
```

## Re-running on already-hardened VPS

The playbooks are idempotent. To re-run on a hardened VPS:
```bash
yarn ansible  # → 2) Secure a VPS
# The script will ask for the root password — but since the VPS is already
# hardened, you can also use the custom playbook option with hardened creds.
```
