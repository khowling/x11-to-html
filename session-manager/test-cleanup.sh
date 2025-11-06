#!/bin/bash
# Test script to verify cleanup on Node.js process termination

echo "=== Container Cleanup Test ==="
echo ""

echo "Step 1: Checking current containers..."
docker ps --filter "label=x11-session-manager=true" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

echo "Step 2: Sending SIGTERM to Node.js process..."
echo "This should trigger graceful shutdown and cleanup all containers"
pkill -TERM -f 'node server.js'
echo ""

echo "Step 3: Waiting 5 seconds for cleanup..."
sleep 5
echo ""

echo "Step 4: Checking containers after cleanup..."
REMAINING=$(docker ps -a --filter "label=x11-session-manager=true" --format "{{.Names}}" | wc -l)

if [ "$REMAINING" -eq 0 ]; then
    echo "✓ SUCCESS: All containers cleaned up!"
else
    echo "✗ FAIL: Found $REMAINING remaining container(s):"
    docker ps -a --filter "label=x11-session-manager=true" --format "table {{.Names}}\t{{.Status}}"
fi
echo ""
