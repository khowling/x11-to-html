#!/bin/bash

# X11 Web Bridge with external X clients

RESOLUTION="${1:-1024x768}"

echo "🚀 Starting X11 Web Bridge for external X clients"
echo " Resolution: $RESOLUTION"

# Stop any existing container
docker-compose down 2>/dev/null

# Update docker-compose.yml with the specified resolution
cat > docker-compose.yml << EOF
version: '3.8'

services:
  x11-web-bridge:
    build: .
    container_name: x11-web-bridge
    ports:
      - "6080:6080"   # noVNC web interface
      - "5901:5901"   # VNC port
      - "6001:6001"   # X11 display port
    environment:
      - VNC_RESOLUTION=$RESOLUTION
      - VNC_DEPTH=24
      - VNC_PORT=5901
      - WEB_PORT=6080
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
docker-compose up --build -d

echo ""
echo "🌐 Web Interface: http://localhost:6080/vnc.html"
echo "🔐 Password: vncpass"
echo ""
echo "📱 To run X applications on your host machine:"
echo "   export DISPLAY=localhost:1"
echo "   xcalc &"
echo "   xterm &"
echo "   firefox &"
echo ""
echo "🛑 To stop: docker-compose down"