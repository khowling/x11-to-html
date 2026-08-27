# X11 Web Bridge

The per-session Linux display container used by the X11-to-HTML session manager.
It runs TigerVNC/Xvnc and a restricted OpenSSH server. Apache Guacamole connects
to VNC over a private Docker network.

## Contents

- TigerVNC/Xvnc display `:1`
- OpenSSH with public-key authentication only
- Supervisor for VNC and SSH process management
- X11 utilities for diagnostics

noVNC and websockify are intentionally not included. Browser access is provided
centrally by Guacamole and `guacd`.

## Build

```bash
docker build -t x11-web-bridge .
```

The session manager normally creates these containers dynamically. It:

1. Generates an ephemeral Ed25519 key.
2. Creates the container on `x11-guacamole`.
3. Publishes SSH on a loopback-only dynamic port.
4. Starts a local SSH forward to X display `:1`.
5. Starts the host X11 application.
6. Gives Guacamole a short-lived VNC connection definition.

## Development helper

`start-display.sh` can run a standalone bridge container for diagnostics after
the private network has been created by `../start-guacamole.sh`:

```bash
./start-display.sh 1920x1080
./run-x11-app.sh xterm
./status.sh
```

Production browser sessions should be created through
`http://localhost:3000`, not by publishing VNC directly.

## Network security

- VNC port 5901 is not published to the host.
- VNC requires a random per-session password supplied to Guacamole.
- SSH is bound to loopback.
- Password, root, interactive, agent, remote, and tunnel authentication features
  are disabled.
- `guacd` reaches VNC over the private Docker network.
