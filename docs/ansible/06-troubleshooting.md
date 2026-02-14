# Troubleshooting

## Connection issues

### "Permission denied (publickey)"

You're connecting with SSH key auth but the key isn't authorized on the VPS.

**Cause**: The VPS hasn't been hardened yet, or the key wasn't deployed.

**Fix**: Use initial mode (root + password) to set up the VPS first:
```bash
npm run ansible -- setup-control
# or for a node:
npm run ansible -- secure
```

### "Connection refused" on port 2222

The VPS hasn't been hardened yet (SSH is still on port 22).

**Fix**: For initial connections, the scripts automatically connect as root on port 22 with a password. Just run the setup/secure command and enter the root password when prompted.

### "Connection timed out"

- Check that the VPS IP is correct in inventory
- Check that the VPS is running (provider dashboard)
- Check your local internet connection

### Ping works but playbook fails

If `npm run ansible -- ping` works but playbooks fail:
- Check the target host is in the right inventory group
- Run with `--verbose` for detailed output
- Use `--check` for a dry run first

## Re-running on an already-hardened VPS

After hardening, root login and password auth are disabled. The scripts use `deploy` user + SSH key on port 2222 by default.

**If you need to re-run the security playbook on a hardened VPS** (e.g., to change settings):

```bash
# This works because deploy user has sudo access
ansible-playbook ansible/playbooks/secure-vps.yml --limit coolify-master
```

No password needed — the inventory defaults handle the connection.

**If you need to re-run setup-control** on a hardened VPS:

The setup-control playbook's Phase 1 connects as root with a password, which won't work on a hardened VPS. To re-run:
1. Reinstall the VPS from your provider dashboard
2. Run setup-control again with the new root password

Or run the individual playbooks (secure-vps, install-coolify) directly — they use hardened creds.

## SSH lockout recovery

If you're locked out of a hardened VPS:

1. **Use provider console**: Most VPS providers have a web/VNC console
2. **Reinstall the VPS**: From the provider dashboard, reinstall the OS
3. **Start fresh**: Run setup-control or secure again

Prevention:
- Always test SSH access immediately after hardening
- Keep your SSH key (`~/.ssh/archeon_vps`) backed up
- The scripts test connectivity at each phase before proceeding

## Inventory issues

### "Could not match supplied host pattern"

The hostname you specified doesn't exist in the inventory.

**Fix**: Check current inventory:
```bash
ansible-inventory --graph
```

### Node was added but can't connect

After adding a node with the wizard, the inventory is updated with **hardened** defaults (deploy/2222/key). But the node hasn't been hardened yet.

The add-node wizard handles this — it changes connection vars to root/22/password for the initial hardening run, then the inventory defaults take over.

If something went wrong mid-wizard, manually run:
```bash
npm run ansible -- secure
```
Select the node and provide the root password.

## Ansible errors

### "Failed to connect to the host via ssh"

Multiple possible causes:
- Wrong IP in inventory
- Wrong port (22 vs 2222)
- Wrong user (root vs deploy)
- SSH key not found

Check the inventory entry:
```bash
ansible-inventory --host <hostname>
```

### "Missing sudo password"

The deploy user should have passwordless sudo. If this error appears, the security hardening didn't complete properly. Connect via provider console and check `/etc/sudoers.d/deploy`.

### "Could not find or access" a role

Run from the project root directory, not from inside `ansible/`:
```bash
# Correct (from project root):
ansible-playbook ansible/playbooks/secure-vps.yml

# Wrong (from ansible/):
cd ansible && ansible-playbook playbooks/secure-vps.yml
```

## Firewall issues

### Locked out by UFW

The security role adds SSH (port 2222) to UFW **before** activating the firewall. If you manually changed UFW rules and got locked out:

1. Use provider console/VNC
2. Run: `sudo ufw allow 2222/tcp && sudo ufw reload`

### Coolify ports not open

Coolify needs ports 8000, 6001, 6002. These are opened by the `install-coolify` role. If they're not open:

```bash
ansible-playbook ansible/playbooks/install-coolify.yml --limit coolify-master
```
