#!/bin/bash

# Docker entrypoint script for VNC + noVNC container

set -e

echo "Starting X11 Web Bridge Container..."
echo "VNC Resolution: $VNC_RESOLUTION"
echo "VNC Depth: $VNC_DEPTH"
echo "VNC Port: $VNC_PORT"
echo "Web Port: $WEB_PORT"

# Create log directory
mkdir -p /var/log/supervisor

# Clean up any existing VNC lock files
rm -rf /tmp/.X*-lock /tmp/.X11-unix

# Ensure VNC user owns their home directory
chown -R vnc:vnc /home/vnc

echo "Starting supervisor..."
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf