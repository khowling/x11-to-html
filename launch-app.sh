#!/bin/bash

# Quick app launcher for single application mode

APP="$1"
RESOLUTION="${2:-800x600}"

if [ -z "$APP" ]; then
    echo "Usage: $0 <application> [resolution]"
    echo ""
    echo "Examples:"
    echo "  $0 xterm 800x600"
    echo "  $0 xcalc 400x500"
    echo "  $0 gedit 1024x768"
    echo "  $0 'firefox --no-sandbox' 1280x720"
    echo ""
    echo "Available applications in container:"
    echo "  - xterm (terminal)"
    echo "  - xcalc (calculator)"
    echo "  - xclock (clock)"
    echo "  - gedit (text editor)"
    echo "  - firefox (web browser - needs additional setup)"
    exit 1
fi

echo "🚀 Starting container with single application: $APP"
echo "📏 Resolution: $RESOLUTION"

# Stop any existing container
./stop-docker-server.sh

# Update docker-compose.yml with the specified app
cat > docker-compose.yml << EOF
version: '3.8'

services:
  x11-web-bridge:
    build: .
    container_name: x11-web-bridge
    ports:
      - "6080:6080"
      - "5901:5901"
    environment:
      - VNC_RESOLUTION=$RESOLUTION
      - VNC_DEPTH=24
      - VNC_PORT=5901
      - WEB_PORT=6080
      - SINGLE_APP=$APP
    volumes:
      - vnc_data:/home/vnc/.vnc
    restart: unless-stopped
    cap_add:
      - SYS_ADMIN
    shm_size: 1gb

volumes:
  vnc_data:
EOF

echo "✅ Updated docker-compose.yml"

# Start the container
./start-docker-server.sh

echo ""
echo "🌐 Access your application at: http://localhost:6080/vnc.html"
echo "🔐 Password: vncpass"