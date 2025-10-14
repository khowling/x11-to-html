# X11 to Web Browser Bridge

This project provides a simple way to expose X11 applications through a web browser using TigerVNC and noVNC. Now available in both native and Docker deployments!

## 🚀 Quick Start (Docker - Recommended)

1. **Install Docker and dependencies:**
   ```bash
   chmod +x install-docker.sh
   ./install-docker.sh
   ```

2. **Start the container:**
   ```bash
   ./start-docker-server.sh
   ```

3. **Access via web browser:**
   - Open: http://localhost:6080/vnc.html
   - Password: `vncpass`

4. **Run X11 applications in container:**
   ```bash
   # Quick test
   docker exec -e DISPLAY=:1 x11-web-bridge xclock
   
   # Interactive shell
   docker exec -it x11-web-bridge bash
   # Then: DISPLAY=:1 xterm
   ```

## 🛠️ Alternative: Native Installation

1. **Install dependencies:**
   ```bash
   chmod +x install.sh
   ./install.sh
   ```

2. **Start the servers:**
   ```bash
   ./start-server.sh
   ```

3. **Run your X11 application:**
   ```bash
   DISPLAY=:1 xterm
   DISPLAY=:1 firefox
   ```

## Configuration

### Docker Settings (docker-compose.yml)
- Display: `:1` (port 5901)
- Resolution: 1024x768 (configurable via environment variables)
- Color depth: 24-bit
- Web Port: 6080
- VNC Password: `vncpass`

### Native Settings
- Display: `:1` (port 5901)
- Resolution: 1024x768 (configurable in `start-server.sh`)
- Color depth: 24-bit

## Customization

### Docker Customization
Edit `docker-compose.yml` environment variables:
```yaml
environment:
  - VNC_RESOLUTION=1920x1080
  - WEB_PORT=8080
  - VNC_PORT=5902
```

### Native Customization
Edit `start-server.sh` to modify:
- `GEOMETRY="1920x1080"` - Change resolution
- `WEB_PORT="8080"` - Change web port
- `VNC_DISPLAY=":2"` - Use different display number

## 📊 Status Monitoring

Check the status of your services anytime:
```bash
./status.sh
```

This shows:
- Docker container status
- Native process status  
- Network port status
- Quick access commands

## Troubleshooting

### Docker Issues
```bash
# Check container status
docker ps
docker logs x11-web-bridge

# Restart container
./stop-docker-server.sh
./start-docker-server.sh

# Access container shell
docker exec -it x11-web-bridge bash
```

### Native Installation Issues
```bash
# Check if display is already in use
ps aux | grep vnc

# Kill existing processes
vncserver -kill :1

# Check websockify
ps aux | grep websockify
```

### Network Issues
```bash
# Check firewall settings
sudo ufw allow 6080
sudo ufw allow 5901

# Test port accessibility
curl http://localhost:6080
```

### X11 Application Issues
```bash
# Inside Docker container
docker exec -it x11-web-bridge bash
echo $DISPLAY  # Should show :1
xhost +local:

# Test simple app
DISPLAY=:1 xclock
```

## 🔒 Security Notes

### Docker Deployment
- Container runs with limited privileges
- No password authentication by default (uses `vncpass`)
- Ports only exposed to localhost by default
- Consider using secrets management for production

### Native Deployment  
- VNC allows connections from any IP (`-localhost no`)
- Password-protected VNC access

### Production Considerations
- Use SSL/TLS certificates with reverse proxy
- Implement proper authentication (LDAP/OAuth)
- Restrict network access with firewall rules
- Use SSH tunneling for remote access
- Change default VNC password

## 🏗️ Architecture

```
Browser <--> noVNC (WebSocket) <--> websockify <--> VNC Server <--> X11 Display
```

## Dependencies

### Docker
- Docker Engine
- Docker Compose

### Native
- tigervnc-standalone-server
- novnc  
- python3-websockify
- X11 fonts and utilities

## 📝 Files Overview

- `Dockerfile` - Container definition
- `docker-compose.yml` - Service orchestration
- `supervisord.conf` - Process management in container
- `start-docker-server.sh` - Start Docker version
- `start-server.sh` - Start native version
- `stop-docker-server.sh` - Stop Docker version
- `stop-server.sh` - Stop native version (auto-detects Docker)
- `status.sh` - Status monitoring for both deployments
- `install-docker.sh` - Docker installation script
- `install.sh` - Native installation script