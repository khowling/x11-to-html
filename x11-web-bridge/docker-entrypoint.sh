#!/bin/bash

# Docker entrypoint script for an application display container

set -e

echo "Starting X11 Web Bridge Container..."
echo "VNC Resolution: $VNC_RESOLUTION"
echo "VNC Depth: $VNC_DEPTH"
echo "VNC Port: $VNC_PORT"

# Create log directory
mkdir -p /var/log/supervisor

# Clean up any existing VNC lock files
rm -rf /tmp/.X*-lock /tmp/.X11-unix
rm -f /tmp/x11-application-ready

# Ensure VNC user owns their home directory
chown -R vnc:vnc /home/vnc

if [[ -z "$VNC_PASSWORD" ]]; then
	echo "VNC_PASSWORD must be provided" >&2
	exit 1
fi

printf '%s\n' "$VNC_PASSWORD" | runuser -u vnc -- vncpasswd -f > /home/vnc/.vnc/passwd
chown vnc:vnc /home/vnc/.vnc/passwd
chmod 600 /home/vnc/.vnc/passwd

echo "Starting supervisor..."
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf