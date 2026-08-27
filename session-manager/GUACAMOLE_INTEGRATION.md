# Guacamole Integration

The Node.js session manager remains responsible for Entra ID authentication,
session ownership, Docker lifecycle, host-side X11 applications, and cleanup.
Apache Guacamole is the browser gateway.

## Request flow

1. The user authenticates with Entra ID.
2. The session manager creates an isolated Xvnc container on the private
   `x11-guacamole` Docker network.
3. The manager establishes a key-only SSH tunnel for the host X11 application.
4. When the user opens the session, the manager creates a short-lived
   Guacamole JSON authentication payload and exchanges it for a fresh
   Guacamole token.
5. The browser is redirected to the dynamic connection using that token, and
   Guacamole asks `guacd` to connect to the container on port 5901.

The VNC port is never published on the host. `guacd` reaches it through the
private Docker network. A unique per-session host-access network enables Docker
Desktop to publish SSH on loopback without placing other session containers on
the same network. Each Xvnc instance additionally requires a random per-session
password which is carried only inside the encrypted Guacamole connection data.

## Dynamic authentication

`services/guacamoleAuth.js` implements Guacamole's encrypted JSON
authentication format:

- HMAC/SHA-256 signature
- AES-128-CBC encryption
- A shared 128-bit hexadecimal secret
- A five-minute default expiry

The same `GUACAMOLE_JSON_SECRET` must be available to the session manager and
the Guacamole container. `start-guacamole.sh` generates it when missing. The
server-side token exchange prevents a previous Guacamole browser session from
overriding the new dynamic connection.

## Removed components

The integration replaces:

- noVNC
- websockify
- `http-proxy-middleware`
- the custom HTTP/WebSocket proxy route

It does not replace Docker orchestration or the encrypted host X11 tunnel.
