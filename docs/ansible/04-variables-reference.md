# Variables Reference

All configuration is in `ansible/group_vars/all/vars.yml`. No vault is used — passwords are passed as one-time extra-vars during setup.

## Admin user

| Variable | Default | Description |
|----------|---------|-------------|
| `admin_user` | `deploy` | Admin username created on each VPS |
| `admin_user_shell` | `/bin/bash` | Shell for the admin user |
| `admin_ssh_key_path` | `~/.ssh/archeon_vps` | Local SSH private key path |
| `admin_ssh_key_comment` | `archeon-deploy-key` | SSH key comment |

## SSH hardening

| Variable | Default | Description |
|----------|---------|-------------|
| `ssh_port` | `2222` | SSH port after hardening |
| `ssh_permit_root_login` | `no` | Disable root SSH login |
| `ssh_password_authentication` | `no` | Disable password auth |
| `ssh_pubkey_authentication` | `yes` | Enable key-based auth |
| `ssh_max_auth_tries` | `3` | Max auth attempts per connection |
| `ssh_login_grace_time` | `20` | Seconds to authenticate |
| `ssh_client_alive_interval` | `300` | Keep-alive interval (seconds) |
| `ssh_client_alive_count_max` | `2` | Max missed keep-alives |
| `ssh_x11_forwarding` | `no` | Disable X11 forwarding |
| `ssh_allow_agent_forwarding` | `no` | Disable agent forwarding |
| `ssh_allow_tcp_forwarding` | `no` | Disable TCP forwarding |
| `ssh_max_sessions` | `3` | Max concurrent sessions |
| `ssh_max_startups` | `10:30:60` | Connection rate limiting |
| `ssh_allowed_users` | `{{ admin_user }}` | Users allowed to SSH |

## Firewall (UFW)

| Variable | Default | Description |
|----------|---------|-------------|
| `firewall_allowed_tcp_ports` | `["80", "443"]` | TCP ports to allow (SSH auto-added) |
| `firewall_allowed_udp_ports` | `[]` | UDP ports to allow |
| `firewall_rate_limit_ssh` | `true` | Rate-limit SSH connections |

## Fail2ban

| Variable | Default | Description |
|----------|---------|-------------|
| `fail2ban_bantime` | `3600` | Ban duration in seconds (1 hour) |
| `fail2ban_findtime` | `600` | Window to count failures (10 min) |
| `fail2ban_maxretry` | `3` | Failed attempts before ban |
| `fail2ban_destemail` | `root@localhost` | Notification email |
| `fail2ban_action` | `%(action_)s` | Action on ban |

## System

| Variable | Default | Description |
|----------|---------|-------------|
| `server_timezone` | `UTC` | Server timezone |
| `enable_auto_updates` | `true` | Enable unattended-upgrades |
| `kernel_hardening` | `true` | Apply sysctl hardening |

## Coolify

| Variable | Default | Description |
|----------|---------|-------------|
| `coolify_ports` | `["8000", "6001", "6002"]` | Ports opened for Coolify |

## Overriding variables

Pass overrides via `--extra-vars`:

```bash
ansible-playbook ansible/playbooks/secure-vps.yml \
  --limit node-01 \
  -e "ssh_port=3333 fail2ban_maxretry=5"
```
