#!/bin/bash

# Start TigerVNC + noVNC servers

set -e

# Configuration
VNC_DISPLAY=":1"
VNC_PORT="5901"
WEB_PORT="6080"
GEOMETRY="1024x768"
DEPTH="24"

echo "Starting TigerVNC + noVNC servers..."

# Kill any existing VNC servers on this display
echo "Cleaning up existing processes..."
vncserver -kill $VNC_DISPLAY 2>/dev/null || true

# Kill any existing websockify processes
pkill -f "websockify.*$WEB_PORT" 2>/dev/null || true

# Wait a moment for cleanup
sleep 2

# Clean up any leftover socket files
rm -f /tmp/.X11-unix/X1 2>/dev/null || true
rm -f /tmp/.X${VNC_DISPLAY#:}-lock 2>/dev/null || true

# Start VNC server with more robust options
echo "Starting VNC server on display $VNC_DISPLAY..."
vncserver $VNC_DISPLAY \
  -geometry $GEOMETRY \
  -depth $DEPTH \
  -localhost no \
  -SecurityTypes VncAuth \
  -rfbauth ~/.vnc/passwd

# Check if VNC server started successfully
if ! pgrep -f "Xvnc.*$VNC_DISPLAY" > /dev/null; then
    echo "ERROR: VNC server failed to start!"
    echo "Check the log file: ~/.vnc/$(hostname):${VNC_PORT}.log"
    exit 1
fi

echo "VNC server started successfully!"

# Wait a moment for VNC server to fully initialize
sleep 3

# Start websockify to bridge VNC and WebSocket
echo "Starting noVNC web server on port $WEB_PORT..."
if command -v websockify > /dev/null; then
    websockify --web=/usr/share/novnc $WEB_PORT localhost:$VNC_PORT &
    WEBSOCKIFY_PID=$!
    echo $WEBSOCKIFY_PID > websockify.pid
    
    # Wait and check if websockify started successfully
    sleep 2
    if kill -0 $WEBSOCKIFY_PID 2>/dev/null; then
        echo "noVNC web server started successfully!"
    else
        echo "ERROR: Failed to start noVNC web server!"
        exit 1
    fi
else
    echo "ERROR: websockify not found! Please install it with:"
    echo "sudo apt-get install python3-websockify"
    exit 1
fi

echo ""
echo "🎉 Servers started successfully!"
echo "VNC Server: localhost:$VNC_PORT (display $VNC_DISPLAY)"
echo "Web Interface: http://localhost:$WEB_PORT/vnc.html"
echo ""
echo "📱 To connect your X11 application, use: DISPLAY=$VNC_DISPLAY your-app"
echo "🔍 To test: DISPLAY=$VNC_DISPLAY xclock &"
echo ""
echo "🛑 To stop servers, run: ./stop-server.sh"