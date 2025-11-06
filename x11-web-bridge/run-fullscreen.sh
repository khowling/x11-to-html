#!/bin/bash

# Run applications in fullscreen mode

APP="$1"

if [ -z "$APP" ]; then
    echo "Usage: $0 <application>"
    echo ""
    echo "Fullscreen Applications:"
    echo "  $0 firefox         # Firefox in kiosk mode"
    echo "  $0 chromium        # Chromium in kiosk mode" 
    echo "  $0 code            # VS Code"
    echo "  $0 gedit           # Text editor"
    echo "  $0 terminal        # Full terminal"
    echo ""
    echo "Custom applications:"
    echo "  $0 'your-app --fullscreen-flag'"
    exit 1
fi

# Check if container is running
if ! docker ps | grep -q "x11-web-bridge"; then
    echo "❌ Container not running. Start it first:"
    echo "   ./start-display.sh"
    exit 1
fi

echo "🚀 Running $APP in fullscreen mode..."

# Set DISPLAY to point to containerized X server
export DISPLAY=localhost:1

# Get current display resolution
RESOLUTION=$(docker exec x11-web-bridge xdpyinfo | grep dimensions | awk '{print $2}')
WIDTH=$(echo $RESOLUTION | cut -d'x' -f1)
HEIGHT=$(echo $RESOLUTION | cut -d'x' -f2)

echo "📏 Display resolution: ${RESOLUTION}"

# Handle different applications with fullscreen options
case "$APP" in
    firefox)
        firefox --kiosk &
        ;;
    chromium|chromium-browser)
        chromium --kiosk --no-sandbox &
        ;;
    google-chrome)
        google-chrome --kiosk --no-sandbox &
        ;;
    code|vscode)
        code --new-window &
        sleep 2
        # Send F11 to toggle fullscreen
        xdotool search --onlyvisible --class "Code" windowactivate key F11
        ;;
    gedit)
        gedit &
        sleep 2
        # Send F11 to toggle fullscreen  
        xdotool search --onlyvisible --class "Gedit" windowactivate key F11
        ;;
    terminal|xterm)
        xterm -geometry ${WIDTH}x$((HEIGHT/20)) &
        ;;
    libreoffice)
        libreoffice --norestore &
        sleep 3
        xdotool search --onlyvisible --class "libreoffice" windowactivate key F11
        ;;
    *)
        # For custom applications, just run them and try F11
        $APP &
        sleep 2
        # Try to make the most recent window fullscreen
        xdotool getactivewindow windowactivate key F11 2>/dev/null || true
        ;;
esac

echo "✅ $APP started in fullscreen mode!"
echo "🌐 View at: http://localhost:6080/vnc.html"
echo "💡 Most apps support F11 to toggle fullscreen manually"