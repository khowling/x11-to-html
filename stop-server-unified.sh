#!/bin/bash

# Stop servers (both native and Docker options)

echo "Stopping X11 Web Bridge servers..."

# Check if running in Docker
if docker ps | grep -q "x11-web-bridge"; then
    echo "Stopping Docker container..."
    ./stop-docker-server.sh
    exit 0
fi

# Native server shutdown
VNC_DISPLAY=":1"
WEB_PORT="6080"

echo "Stopping native TigerVNC + noVNC servers..."

# Stop VNC server
if pgrep -f "Xvnc.*$VNC_DISPLAY" > /dev/null; then
    echo "Stopping VNC server..."
    vncserver -kill $VNC_DISPLAY 2>/dev/null || echo "Failed to stop VNC server gracefully"
else
    echo "VNC server not running"
fi

# Stop websockify
echo "Stopping websockify..."
if [ -f websockify.pid ]; then
    if kill $(cat websockify.pid) 2>/dev/null; then
        echo "websockify stopped"
    else
        echo "websockify PID file exists but process not running"
    fi
    rm -f websockify.pid
else
    # Try to kill any websockify processes on our port
    pkill -f "websockify.*$WEB_PORT" 2>/dev/null && echo "websockify stopped" || echo "websockify not running"
fi

# Clean up any leftover files
rm -f /tmp/.X11-unix/X1 2>/dev/null || true
rm -f /tmp/.X${VNC_DISPLAY#:}-lock 2>/dev/null || true

echo "✅ Servers stopped and cleaned up."