#!/bin/bash

# Docker entrypoint script for the VNC display container

set -e

echo "Starting X11 Web Bridge Container..."
echo "VNC Resolution: $VNC_RESOLUTION"
echo "VNC Depth: $VNC_DEPTH"
echo "VNC Port: $VNC_PORT"

# Create log directory
mkdir -p /var/log/supervisor

# Clean up any existing VNC lock files
rm -rf /tmp/.X*-lock /tmp/.X11-unix

# Ensure VNC user owns their home directory
chown -R vnc:vnc /home/vnc

if [[ -z "$SSH_AUTHORIZED_KEY" ]]; then
	echo "SSH_AUTHORIZED_KEY must be provided" >&2
	exit 1
fi

if [[ -z "$VNC_PASSWORD" ]]; then
	echo "VNC_PASSWORD must be provided" >&2
	exit 1
fi

printf '%s\n' "$VNC_PASSWORD" | runuser -u vnc -- vncpasswd -f > /home/vnc/.vnc/passwd
chown vnc:vnc /home/vnc/.vnc/passwd
chmod 600 /home/vnc/.vnc/passwd

install -d -m 700 -o vnc -g vnc /home/vnc/.ssh
printf '%s\n' "$SSH_AUTHORIZED_KEY" > /home/vnc/.ssh/authorized_keys
chown vnc:vnc /home/vnc/.ssh/authorized_keys
chmod 600 /home/vnc/.ssh/authorized_keys
passwd -d vnc >/dev/null

mkdir -p /run/sshd
ssh-keygen -A
cat > /etc/ssh/sshd_config.d/x11-bridge.conf <<'EOF'
PasswordAuthentication no
PermitEmptyPasswords no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
AllowUsers vnc
AllowTcpForwarding local
GatewayPorts no
X11Forwarding no
PermitTunnel no
AllowAgentForwarding no
EOF

echo "Starting supervisor..."
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf