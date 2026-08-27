# X11-to-HTML with Apache Guacamole

A web-based gateway for host X11 applications. Users authenticate with
Microsoft Entra ID, receive an isolated Xvnc container, and access the display
through Apache Guacamole.

## Architecture

```mermaid
flowchart LR
    B[Browser] -->|Express session| N[Node session manager]
    N <-->|Authorization code + PKCE| E[Microsoft Entra ID]
    N -->|Create and remove sessions| D[Docker Engine]
    N -->|Encrypted JSON to fresh token| G[Guacamole]
    B -->|Fresh launch token| G
    G --> Q[guacd]
    Q -->|VNC on private network| X[Per-session Xvnc container]
    H[Host X11 application] -->|Loopback, key-only SSH tunnel| X
```

The Node application is the control plane. It owns authentication, authorization,
container creation, host process startup, and cleanup. Guacamole and `guacd`
provide the browser remote-display data plane.

## Session lifecycle

1. The user signs in through Microsoft Entra ID. The session manager uses the
   authorization-code flow with PKCE and records the returned account identity
   in its Express session.
2. The dashboard synchronously opens a dedicated popup window. It measures the
   popup's usable viewport and sends those dimensions to the session manager
   while receiving creation progress through Server-Sent Events.
3. The manager creates a uniquely named container running Xvnc and SSH. Xvnc
   starts at the measured browser resolution and can accept later display-size
   updates from Guacamole.
4. The manager generates a per-session Ed25519 SSH key and creates a
   loopback-only SSH forward from WSL into the container's X11 display. The host
   `xterm` process uses that tunnel as its display.
5. After the container and host application are ready, the popup requests
   `/sessions/:sessionId/launch`. The manager verifies ownership, signs and
   encrypts a short-lived Guacamole connection definition, and exchanges it
   server-side for a fresh Guacamole authentication token.
6. The popup is redirected to the dynamic Guacamole client. `guacd` connects to
   Xvnc over the private Docker network and Guacamole carries display, keyboard,
   pointer, and clipboard traffic between Xvnc and the browser.
7. Deleting the session, closing its host `xterm`, or shutting down the manager
   stops the processes and container and removes temporary credentials and the
   per-session network.

## Security model

- Entra ID protects the session manager. The authorization-code flow uses PKCE,
  and application routes rely on an HTTP-only Express session cookie.
- All user session routes require authentication. Read, launch, and delete
  operations compare the session owner with the signed-in Entra account ID.
- Each user session runs in a separate, uniquely named Docker container.
- VNC is never published to the host; `guacd` reaches it through the private
  `x11-guacamole` Docker network.
- Every VNC server has a random per-session password. It is retained only by the
  control plane and included inside the encrypted Guacamole connection data.
- Host X11 traffic uses an ephemeral per-session Ed25519 key and a
  loopback-only SSH tunnel. Password-based SSH access is not used.
- Guacamole connections are supplied through signed, AES-encrypted JSON with a
  short expiry. The HMAC-SHA256 signature detects modification, and AES-128-CBC
  protects the connection parameters using the shared JSON secret.
- Every launch performs a new server-side token exchange. The fresh token in
  the redirect overrides any older Guacamole token cached by the browser.
- Browser-facing session responses exclude VNC credentials, SSH key locations,
  and internal Docker network details.
- Guacamole is published only on `127.0.0.1:8080`; the SSH endpoint for each
  container is also published only on loopback.
- The admin dashboard requires an exact email match in `ADMIN_USERS`.
- Session deletion removes the container, SSH tunnel, host `xterm`, temporary
  SSH credentials, in-memory ownership record, and per-session host network.

### Deployment boundary

The default configuration is intended for local development under WSL and
Docker Desktop. Before exposing it beyond the local machine:

- Terminate HTTPS at a trusted reverse proxy and configure secure proxy/cookie
  settings.
- Set a strong `SESSION_SECRET`; never rely on the development fallback.
- Replace Express's in-memory session store with a production session store.
- Change session creation to a state-changing HTTP method and add CSRF
  protection to create/delete operations.
- Prevent Guacamole launch URLs and their tokens from being written to access
  logs, analytics, browser telemetry, or referrer destinations.
- Review VNC credential strength and Xvnc's `-ac` setting for the intended
  multi-tenant threat model.
- Protect `GUACAMOLE_JSON_SECRET`: possession of this shared secret allows a
  caller to mint trusted dynamic Guacamole connection definitions.

## Prerequisites

- Node.js 18 or newer
- Docker with Docker Compose
- OpenSSH client tools and `xterm`
- Microsoft Entra ID application registration

## Setup

1. Configure the application:

   ```bash
   cp session-manager/.env.example session-manager/.env
   ```

   Set the Entra ID client secret and session secret. The Guacamole startup
   script generates `GUACAMOLE_JSON_SECRET` if it is missing.

2. Build the display image:

   ```bash
   docker build -t x11-web-bridge x11-web-bridge
   ```

3. Start Guacamole:

   ```bash
   ./start-guacamole.sh
   ```

4. Install and start the session manager:

   ```bash
   cd session-manager
   npm install
   npm start
   ```

5. Open `http://localhost:3000`.

Guacamole is bound to `http://localhost:8080` and is normally entered through
the authenticated session launch endpoint. The browser is redirected with a
fresh Guacamole token only after the backing session is ready.

Docker Desktop requires the per-session container to have a host-access network
for its loopback SSH publication. The manager creates a unique network for this
purpose and removes it with the session. VNC remains available only on the
container networks and is never published to the host; `guacd` reaches it through
the separate internal `x11-guacamole` network.

## Components

### `session-manager/`

- Express and EJS web application
- Microsoft MSAL/Entra ID authentication
- Docker session orchestration
- Server-Sent Events creation progress
- Popup sizing and delayed launch
- Guacamole encrypted JSON generation and fresh-token exchange
- User and administrator session controls

### `x11-web-bridge/`

- TigerVNC/Xvnc display server
- Key-only OpenSSH endpoint
- Supervisor process management
- Host X11 helper scripts

### `docker-compose.guacamole.yml`

- Apache Guacamole 1.6.0 web application
- `guacd` protocol proxy
- Private external Docker network shared with session containers

## Main endpoints

- `GET /auth/login` - start Entra ID authentication
- `GET /auth/callback` - authentication callback
- `GET /dashboard` - user session dashboard
- `GET /sessions` - list the current user's sessions
- `GET /sessions/create` - create a session with SSE progress
- `GET /sessions/:id/launch` - authorize and redirect to a fresh Guacamole client
- `GET /sessions/:id` - retrieve session status
- `DELETE /sessions/:id` - destroy a session
- `GET /admin` - administrator dashboard
- `GET /admin/sessions/:id/launch` - launch a session as an administrator

## Development checks

```bash
cd session-manager
npm test
```

## License

MIT
