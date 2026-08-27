# X11 Application Base Image

Shared private-display base for the application-specific images in
`../x11-apps/`.

It contains:

- TigerVNC/Xvnc display `:1`
- Supervisor process management
- X11 fonts and display diagnostics
- Per-session VNC password setup

It intentionally contains no user application, SSH server, noVNC, or
websockify. Each child image installs one allowlisted X11 application and
provides `/usr/local/bin/start-x11-application`.

Build all images from the repository root:

```bash
./build-images.sh
```

The resulting images are:

- `x11-web-base`
- `x11-app-xterm`
- `x11-app-xeyes`

Application containers join only the internal `x11-guacamole` Docker network.
Their VNC port is not published to the host.
