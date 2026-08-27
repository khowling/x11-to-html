#!/bin/bash

# X11 Web Bridge with external X clients

set -euo pipefail

RESOLUTION="${1:-1024x768}"
STATE_DIR="${XDG_RUNTIME_DIR:-/tmp}/x11-web-bridge-${UID}"
PRIVATE_KEY="$STATE_DIR/id_ed25519"
KNOWN_HOSTS="$STATE_DIR/known_hosts"
TUNNEL_PID_FILE="$STATE_DIR/ssh-tunnel.pid"

echo "🚀 Starting X11 Web Bridge for external X clients"
echo " Resolution: $RESOLUTION"

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

if [[ -f "$TUNNEL_PID_FILE" ]]; then
    OLD_TUNNEL_PID="$(cat "$TUNNEL_PID_FILE")"
    kill "$OLD_TUNNEL_PID" 2>/dev/null || true
    rm -f "$TUNNEL_PID_FILE"
fi

docker compose down 2>/dev/null || true
rm -f "$PRIVATE_KEY" "$PRIVATE_KEY.pub" "$KNOWN_HOSTS"
ssh-keygen -q -t ed25519 -N '' -f "$PRIVATE_KEY"

export VNC_RESOLUTION="$RESOLUTION"
export VNC_PASSWORD="$(openssl rand -hex 4)"
export SSH_AUTHORIZED_KEY="$(cat "$PRIVATE_KEY.pub")"

# Start the container
docker compose up --build -d

ssh -N \
    -L 127.0.0.1:6001:127.0.0.1:6001 \
    -p 2222 \
    -i "$PRIVATE_KEY" \
    -o BatchMode=yes \
    -o ConnectionAttempts=10 \
    -o ConnectTimeout=2 \
    -o ExitOnForwardFailure=yes \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=accept-new \
    -o "UserKnownHostsFile=$KNOWN_HOSTS" \
    vnc@127.0.0.1 &
TUNNEL_PID=$!
echo "$TUNNEL_PID" > "$TUNNEL_PID_FILE"

for _ in {1..20}; do
    if kill -0 "$TUNNEL_PID" 2>/dev/null && (echo > /dev/tcp/127.0.0.1/6001) 2>/dev/null; then
        break
    fi
    sleep 0.25
done

if ! kill -0 "$TUNNEL_PID" 2>/dev/null || ! (echo > /dev/tcp/127.0.0.1/6001) 2>/dev/null; then
    echo "SSH tunnel failed to start" >&2
    docker compose down
    exit 1
fi

echo ""
echo "🌐 Open sessions through the manager at http://localhost:3000"
echo "🔐 Host X11 traffic is encrypted through SSH"
echo ""
echo "📱 To run X applications on your host machine:"
echo "   export DISPLAY=localhost:1"
echo "   xcalc &"
echo "   xterm &"
echo "   firefox &"
echo ""
echo "🛑 To stop: docker compose down"