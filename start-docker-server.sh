#!/bin/bash

# Start Docker-based TigerVNC + noVNC servers

set -e

echo "Starting X11 Web Bridge Docker container..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is available
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    echo "Error: Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

# Stop any existing container
echo "Stopping any existing container..."
$COMPOSE_CMD down 2>/dev/null || true

# Build and start the container
echo "Building and starting container..."
$COMPOSE_CMD up --build -d

# Wait for services to start
echo "Waiting for services to start..."
sleep 5

# Check if container is running
if docker ps | grep -q "x11-web-bridge"; then
    echo ""
    echo "✅ Container started successfully!"
    echo "🌐 Web Interface: http://localhost:6080/vnc.html"
    echo "🔐 VNC Password: vncpass"
    echo ""
    echo "To run X11 applications in the container:"
    echo "   docker exec -it x11-web-bridge bash"
    echo "   # Then inside container: DISPLAY=:1 xterm"
    echo ""
    echo "To run X11 apps directly:"
    echo "   docker exec -e DISPLAY=:1 x11-web-bridge xterm"
    echo ""
    echo "To stop: ./stop-server.sh"
else
    echo "❌ Failed to start container. Check logs with:"
    echo "   docker logs x11-web-bridge"
    exit 1
fi