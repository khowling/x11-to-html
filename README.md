# X11 Web Bridge

Run X11 applications directly in your web browser using Docker + TigerVNC + noVNC.

## Quick Start

```bash
# Launch any X11 application
./launch-app.sh xcalc 400x500          # Calculator
./launch-app.sh xterm 800x600          # Terminal  
./launch-app.sh xclock 300x300         # Clock

# Access via browser
# URL: http://localhost:6080/vnc.html
# Password: vncpass
```

*Requires Docker and Docker Compose*

## Features

✅ **Single Application Mode** - Clean interface, no desktop clutter  
✅ **Docker Containerized** - Easy deployment, no host dependencies  
✅ **Web Access** - Works on any device with a browser  
✅ **Customizable** - Adjustable resolution and applications

## Manual Usage

```bash
# Start specific application
./launch-app.sh <app> [resolution]

# Stop container  
./stop-docker-server.sh

# Check status
./status.sh
```

## Available Applications

- `xterm` - Terminal
- `xcalc` - Calculator  
- `xclock` - Clock
- `gedit` - Text editor

## Customization

Edit `docker-compose.yml` to change defaults:
```yaml
environment:
  - SINGLE_APP=your-app
  - VNC_RESOLUTION=1024x768
```

## Architecture

```
Browser → noVNC → websockify → VNC Server → X11 App
```

## Files

- `launch-app.sh` - Main script to run applications
- `Dockerfile` - Container definition
- `docker-compose.yml` - Current app configuration
- `docker-compose-examples.yml` - Example configurations
- `start-docker-server.sh` / `stop-docker-server.sh` - Container management
- `status.sh` - Monitor running services