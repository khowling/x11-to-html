# Session Manager

Node.js control plane for authenticated, per-user X11 sessions delivered through
Apache Guacamole.

## Responsibilities

- Authenticate users with Microsoft Entra ID.
- Create and destroy isolated Xvnc containers with Docker.
- Start a host `xterm` against each container through a key-only SSH tunnel.
- Exchange short-lived encrypted Guacamole connection data for fresh launch
  tokens.
- Enforce session ownership and provide user/admin dashboards.

Guacamole handles browser display transport. This service does not proxy VNC,
HTTP, or WebSocket traffic.

## Configuration

Copy `.env.example` to `.env` and configure:

```env
CLIENT_ID=your-application-id
TENANT_ID=your-tenant-id
CLIENT_SECRET=your-client-secret
REDIRECT_URI=http://localhost:3000/auth/callback

SESSION_SECRET=your-random-session-secret
PORT=3000
HOST=localhost

X11_BRIDGE_IMAGE=x11-web-bridge
X11_BRIDGE_SSH_BASE_PORT=22000
X11_BRIDGE_X11_BASE_PORT=6001
X11_DOCKER_NETWORK=x11-guacamole

GUACAMOLE_PUBLIC_URL=http://localhost:8080/
GUACAMOLE_API_URL=http://localhost:8080/
GUACAMOLE_PORT=8080
GUACAMOLE_JSON_SECRET=32-hexadecimal-characters
GUACAMOLE_TOKEN_TTL_SECONDS=300

ADMIN_USERS=admin@example.com
```

`GUACAMOLE_JSON_SECRET` must match the value used by the Guacamole container.
The repository's `start-guacamole.sh` script generates and shares this value.
`GUACAMOLE_API_URL` is the server-side Guacamole address used to exchange each
dynamic connection for a fresh launch token.

## Run

From the repository root:

```bash
docker build -t x11-web-bridge x11-web-bridge
./start-guacamole.sh
```

Then:

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## API

### Authentication

- `GET /auth/login`
- `GET /auth/callback`
- `GET /auth/logout`

### Sessions

- `GET /sessions`
- `GET /sessions/create`
- `GET /sessions/:sessionId/launch`
- `GET /sessions/:sessionId`
- `DELETE /sessions/:sessionId`
- `DELETE /sessions`

### Administration

- `GET /admin`
- `GET /admin/sessions`
- `GET /admin/sessions/:sessionId/launch`
- `DELETE /admin/sessions/:sessionId`
- `GET /admin/stats`

## Security notes

- All session routes require an authenticated Express session.
- User launch and deletion operations verify ownership against the Entra
  account ID stored in that session.
- VNC remains private to the Docker network and requires a per-session password.
- Host X11 traffic crosses a loopback-only SSH tunnel using an ephemeral
  Ed25519 key.
- Guacamole connection data is HMAC-SHA256 signed, AES-128-CBC encrypted, and
  short-lived. Launching exchanges it server-side for a fresh Guacamole token.
- Client-facing session JSON excludes private credentials and internal network
  names.

The default setup is for local WSL development. Internet-facing deployments
must add HTTPS, secure proxy and cookie settings, a strong `SESSION_SECRET`, a
persistent Express session store, CSRF protection, and access-log filtering for
Guacamole launch tokens.

## Tests

```bash
npm test
```

The tests verify compatibility with Guacamole's signed and encrypted JSON
authentication format.
