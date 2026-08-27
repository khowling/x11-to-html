#!/bin/bash

# Check status of X11 Web Bridge servers

echo "🔍 Checking X11 Web Bridge Status..."
echo

# Check Docker container
echo "📦 Docker Container Status:"
if docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -q "x11-web-bridge"; then
    echo "✅ Container is running:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep "x11-web-bridge"
    
    echo
    echo "📊 Container Logs (last 10 lines):"
    docker logs --tail 10 x11-web-bridge 2>/dev/null || echo "No logs available"
    
    echo
    echo "🌐 Access Points:"
    echo "   Web Interface: http://localhost:6080/vnc.html"
    echo "   X11 transport: SSH tunnel on localhost:6001"
    
    echo
    echo "🔧 Quick Commands:"
    echo "   Test X11: docker exec -e DISPLAY=:1 x11-web-bridge xclock"
    echo "   Shell:     docker exec -it x11-web-bridge bash"
    echo "   Stop:      docker-compose down"
    
else
    echo "❌ Docker container not running"
    
    # Check if image exists
    if docker images | grep -q "x11html-take2"; then
        echo "   (Image exists, use ./start-display.sh to start)"
    else
        echo "   (Image not built, use ./start-display.sh to build and start)"
    fi
fi

echo
echo "🖥️  Native Process Status:"

# Check VNC server
VNC_DISPLAY=":1"
if pgrep -f "Xvnc.*$VNC_DISPLAY" > /dev/null; then
    VNC_PID=$(pgrep -f "Xvnc.*$VNC_DISPLAY")
    echo "✅ VNC Server running (PID: $VNC_PID, Display: $VNC_DISPLAY)"
else
    echo "❌ VNC Server not running"
fi

# Check websockify
WEB_PORT="6080"
if pgrep -f "websockify.*$WEB_PORT" > /dev/null; then
    WEBSOCKIFY_PID=$(pgrep -f "websockify.*$WEB_PORT")
    echo "✅ noVNC/websockify running (PID: $WEBSOCKIFY_PID, Port: $WEB_PORT)"
    echo "   Web Interface: http://localhost:$WEB_PORT/vnc.html"
else
    echo "❌ noVNC/websockify not running"
fi

echo
echo "🌐 Network Status:"
# Check if ports are listening
if netstat -ln 2>/dev/null | grep -q ":6080 "; then
    echo "✅ Port 6080 (noVNC) is listening"
elif ss -ln 2>/dev/null | grep -q ":6080 "; then
    echo "✅ Port 6080 (noVNC) is listening"
else
    echo "❌ Port 6080 (noVNC) not listening"
fi

if netstat -ln 2>/dev/null | grep -q ":6001 "; then
    echo "✅ Port 6001 (SSH-forwarded X11) is listening"
elif ss -ln 2>/dev/null | grep -q ":6001 "; then
    echo "✅ Port 6001 (SSH-forwarded X11) is listening"
else
    echo "❌ Port 6001 (SSH-forwarded X11) not listening"
fi

echo