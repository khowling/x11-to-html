#!/bin/bash

# Stop Docker-based TigerVNC + noVNC servers

echo "Stopping X11 Web Bridge Docker container..."

# Check if Docker Compose is available
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    echo "Error: Docker Compose is not available."
    exit 1
fi

# Stop and remove containers
$COMPOSE_CMD down

echo "Container stopped successfully."