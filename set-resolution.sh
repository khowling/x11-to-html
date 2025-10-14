#!/bin/bash

# Set custom resolution for the X11 display

RESOLUTION="$1"

if [ -z "$RESOLUTION" ]; then
    echo "Usage: $0 <resolution>"
    echo ""
    echo "Examples:"
    echo "  $0 1920x1080    # Full HD"
    echo "  $0 1440x900     # Laptop resolution"
    echo "  $0 1280x720     # HD"
    echo "  $0 2560x1440    # 2K"
    echo ""
    echo "Current resolution:"
    if docker ps | grep -q "x11-web-bridge"; then
        docker exec x11-web-bridge xdpyinfo | grep dimensions | awk '{print "  " $2}'
    else
        echo "  Container not running"
    fi
    exit 1
fi

echo "🖥️  Changing resolution to $RESOLUTION..."

# Stop current container
docker-compose down 2>/dev/null

# Start with new resolution
./launch-app.sh "$RESOLUTION"

echo "✅ Display resolution changed to $RESOLUTION"
echo "🌐 Access at: http://localhost:6080/vnc.html"