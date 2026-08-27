#!/bin/bash

set -euo pipefail

echo "Checking X11-to-Guacamole services..."
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" \
    --filter "name=x11-web-bridge" \
    --filter "name=x11-guacd" \
    --filter "name=x11-guacamole"

if docker ps --format '{{.Names}}' | grep -qx 'x11-web-bridge'; then
    docker exec x11-web-bridge pgrep -x Xvnc >/dev/null \
        && echo "VNC server: running" \
        || echo "VNC server: stopped"
    docker exec x11-web-bridge pgrep -x sshd >/dev/null \
        && echo "SSH server: running" \
        || echo "SSH server: stopped"
fi

echo "Session manager: http://localhost:3000"
echo "Guacamole: http://localhost:8080"