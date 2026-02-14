# Getting Started — From Zero

## Prerequisites

Install on macOS:

```bash
brew install ansible
brew install esolitos/ipa/sshpass
```

Generate an SSH key (if you don't have one):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/archeon_vps -C "archeon-deploy-key"
```

## Step 1: Setup the Control VPS

Get a fresh Ubuntu 22.04+ VPS from any provider. You need the IP and root password.

```bash
yarn ansible
# Select: 1) Setup control VPS
# Enter the root password when prompted
```

This will:
1. Connect as root with the password (used once, never stored)
2. Harden the VPS (deploy user, port 2222, firewall, fail2ban, etc.)
3. Install Docker + Coolify

After completion:
- **Coolify dashboard**: `http://<IP>:8000`
- **SSH**: `ssh -i ~/.ssh/archeon_vps -p 2222 deploy@<IP>`

## Step 2: Add Node VPSes

For each worker node:

```bash
yarn ansible
# Select: 4) Add a new node
# Enter: name, IP, root password
```

The wizard will:
1. Add the node to `ansible/inventory.yml` with hardened credentials
2. Test SSH connectivity
3. Run the security playbook (using root password as a one-time override)

After completion, add the node in the Coolify dashboard:
- **Host**: `<node-IP>`
- **Port**: `2222`
- **User**: `deploy`
- **SSH Key**: contents of `~/.ssh/archeon_vps`

## Step 3: Deploy apps via Coolify

Open the Coolify dashboard and configure your applications. Coolify manages deployments to the nodes.

## Updating the control VPS IP

If you migrate to a new VPS:

```bash
yarn ansible
# Select: 9) Update control VPS
# Enter the new IP
```

This updates the IP across all files (inventory, scripts, docs).

Then run setup again:
```bash
yarn ansible
# Select: 1) Setup control VPS
```

## Removing a node

```bash
yarn ansible
# Select: 5) Remove a node
# Select the node to remove
```

Then also remove it from the Coolify dashboard and destroy the VPS if no longer needed.
