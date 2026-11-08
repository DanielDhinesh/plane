#!/usr/bin/env bash
# One-time setup of a fresh Amazon Linux 2023 EC2 instance for Velora.
# Paste into EC2 "User data" at launch, or run once with sudo.
set -euo pipefail

dnf update -y
dnf install -y docker git jq
systemctl enable --now docker

# Docker Compose v2 plugin + buildx
ARCH="$(uname -m)"
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-${ARCH}" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

usermod -aG docker ec2-user

# Small hosts: add swap so image pulls and migrations never OOM.
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile swap swap defaults 0 0" >>/etc/fstab
fi

# Restart the stack automatically after a reboot.
cat >/etc/systemd/system/velora.service <<'UNIT'
[Unit]
Description=Velora
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/velora/deployments/aws
ExecStart=/usr/bin/docker compose --env-file .env -f docker-compose.aws.yml up -d
ExecStop=/usr/bin/docker compose --env-file .env -f docker-compose.aws.yml down
User=ec2-user

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable velora.service

mkdir -p /opt/velora && chown ec2-user:ec2-user /opt/velora
echo "Bootstrap complete. Clone the repo into /opt/velora, add .env files, then run scripts/deploy.sh."
