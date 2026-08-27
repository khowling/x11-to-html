#!/bin/bash

# Run an X application on the host against the bridge display

APP="$1"
FULLSCREEN="$2"

if [ -z "$APP" ]; then
    echo "Usage: $0 <application> [fullscreen]"
    echo ""
    echo "Examples:"
    echo "  $0 xcalc"
    echo "  $0 xterm"
    echo "  $0 xclock"
    echo "  $0 gedit"
    echo "  $0 firefox"
    echo "  $0 firefox fullscreen      # Opens Firefox in fullscreen"
    echo "  $0 'xterm -fullscreen' "
    echo ""
    echo "Make sure the X11 Web Bridge container is running first:"
    echo "  ./start-display.sh"
    exit 1
fi

# Check if container is running
if ! docker ps | grep -q "x11-web-bridge"; then
    echo "❌ Container not running. Start it first:"
    echo "   ./start-display.sh"
    exit 1
fi

echo "🚀 Running $APP on host machine..."
echo "📺 Display is available through Apache Guacamole"

# Set DISPLAY to point to containerized X server
export DISPLAY=localhost:1

# Handle fullscreen applications
case "$APP" in
    firefox)
        if [ "$FULLSCREEN" = "fullscreen" ]; then
            firefox --kiosk &
        else
            firefox &
        fi
        ;;
    chromium*|google-chrome*)
        if [ "$FULLSCREEN" = "fullscreen" ]; then
            $APP --kiosk &
        else
            $APP &
        fi
        ;;
    xterm)
        if [ "$FULLSCREEN" = "fullscreen" ]; then
            xterm -fullscreen &
        else
            xterm &
        fi
        ;;
    *)
        # For other apps, just run them
        $APP &
        ;;
esac

echo "✅ $APP started with PID $!"
echo "🌐 Open the session manager at: http://localhost:3000"

if [ "$FULLSCREEN" = "fullscreen" ]; then
    echo "🔲 Application should open in fullscreen mode"
else
    echo "💡 To run in fullscreen: $0 $APP fullscreen"
fi