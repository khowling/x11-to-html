# X11-to-HTML Bridge

A secure web-based solution for accessing X11 applications through a browser using noVNC. Users authenticate via Azure EntraID and get isolated Docker containers running X11 sessions accessible through an authenticated proxy.

## Architecture

```mermaid
graph LR
    subgraph "Session Manager"
        direction TB
        AUTH["/auth - EntraID Auth"]
        SM["/sessions - Session CRUD"]
        PROXY["/proxy - Authenticated Proxy"]
    end
    
    PROXY -->|:6080| D1
    PROXY -->|:6081| D2
    
    SM -->|Fork Process| XT1
    SM -->|Fork Process| XT2
    
    subgraph CC["Container Cluster"]
        direction TB
        subgraph C1["Container 1"]
            D1["Docker Container<br/>Xvfb :0 + noVNC<br/>Port 6080→6080, 6001→6001"]
        end
        
        subgraph C2["Container 2"]
            D2["Docker Container<br/>Xvfb :0 + noVNC<br/>Port 6081→6080, 6002→6001"]
        end
    end
    
    SM -->|Deploy Container| D1
    SM -->|Deploy Container| D2
    
    D1 -.->|X11 Port :6001| XT1
    D2 -.->|X11 Port :6002| XT2
    
    subgraph HP["Host Processes"]
        direction TB
        XT1["xterm Process 1<br/>DISPLAY=container:1"]
        XT2["xterm Process 2<br/>DISPLAY=container:2"]
    end
    
    style AUTH fill:#e1f5ff
    style PROXY fill:#ffe1e1
    style D1 fill:#e8f5e9
    style D2 fill:#e8f5e9
    style XT1 fill:#fff9c4
    style XT2 fill:#fff9c4
```

## Request Flow

```mermaid
sequenceDiagram
    participant Browser
    participant EntraID
    participant SessionMgr as Session Manager
    participant Proxy
    participant Docker
    participant Container
    
    Note over Browser,Container: Authentication
    Browser->>SessionMgr: GET /
    SessionMgr->>Browser: Redirect to EntraID
    Browser->>EntraID: Login
    EntraID->>Browser: Auth Code
    Browser->>SessionMgr: Auth Code
    SessionMgr->>EntraID: Exchange for Token
    EntraID->>SessionMgr: User Info
    SessionMgr->>Browser: Set Session Cookie
    
    Note over Browser,Container: Session Creation
    Browser->>SessionMgr: GET /sessions/create
    SessionMgr->>Docker: Create Container
    Docker->>Container: Start Xvfb noVNC xterm
    Container-->>SessionMgr: Port 608x
    SessionMgr->>Browser: proxyUrl + sessionId
    
    Note over Browser,Container: Proxied Access
    Browser->>Proxy: GET /proxy/sessionId/vnc.html
    Note right of Browser: Session Cookie sent
    Proxy->>Proxy: Validate Cookie
    Proxy->>Proxy: Check User Owns Session
    Proxy->>Container: GET /vnc.html
    Container->>Proxy: HTML + JavaScript
    Proxy->>Browser: noVNC Interface
    
    Note over Browser,Container: WebSocket Connection
    Browser->>Proxy: WebSocket Upgrade
    Note right of Browser: /proxy/sessionId/websockify
    Proxy->>Proxy: Validate Cookie
    Proxy->>Proxy: Check User Owns Session
    Proxy->>Container: WebSocket Upgrade
    Container-->>Proxy: WebSocket Connected
    Proxy-->>Browser: WebSocket Connected
    loop VNC Protocol
        Browser->>Proxy: VNC Data
        Proxy->>Container: Forward Data
        Container-->>Proxy: VNC Response
        Proxy-->>Browser: Forward Response
    end
    
    Note over Browser,Container: Cleanup
    Browser->>SessionMgr: DELETE /sessions/sessionId
    SessionMgr->>Docker: Stop Remove Container
    SessionMgr->>Browser: Success
```

## Components

### Session Manager (`/session-manager`)
Node.js/Express application providing:
- **Authentication**: Azure EntraID integration
- **Session Management**: Create, list, destroy user sessions
- **Container Orchestration**: Docker API integration
- **Authenticated Proxy**: HTTP and WebSocket proxy with session validation
- **Admin Interface**: View all active sessions

### X11 Web Bridge (`/x11-web-bridge`)
Docker image containing:
- **Xvfb**: Virtual X11 display server
- **noVNC**: HTML5 VNC client (websockify + web interface)
- **xterm**: Sample X11 application
- **Supervisor**: Process management

## Quick Start

### Prerequisites
- Docker
- Node.js 18+
- Azure EntraID app registration

### Configuration

Create `/session-manager/.env`:
```env
# Azure EntraID
TENANT_ID=your-tenant-id
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
REDIRECT_URI=http://localhost:3000/auth/redirect

# Session
SESSION_SECRET=your-random-secret
PORT=3000

# Admin users (comma-separated emails)
ADMIN_USERS=admin@example.com
```

### Run

```bash
# Build Docker image
cd x11-web-bridge
docker build -t x11-web-bridge .

# Install and start session manager
cd ../session-manager
npm install
npm start
```

Navigate to `http://localhost:3000`

## Security Features

- ✅ **EntraID Authentication**: Enterprise SSO integration
- ✅ **Session Cookie Validation**: All requests authenticated
- ✅ **User Ownership Check**: Users can only access their own sessions
- ✅ **Isolated Containers**: Each session runs in separate Docker container
- ✅ **Automatic Cleanup**: Containers removed when sessions destroyed
- ✅ **No Direct Container Access**: All access through authenticated proxy

## API Endpoints

### Authentication
- `GET /` - Landing page / redirect to dashboard
- `GET /auth/signin` - Initiate EntraID login
- `GET /auth/redirect` - EntraID callback
- `GET /auth/signout` - Logout

### Sessions (Requires Auth)
- `GET /sessions` - List user's sessions
- `GET /sessions/create` - Create new session (SSE)
- `GET /sessions/:id` - Get session details
- `DELETE /sessions/:id` - Destroy session

### Proxy (Session Cookie Auth)
- `GET /proxy/:sessionId/*` - HTTP proxy to container
- `WebSocket /proxy/:sessionId/websockify` - WebSocket proxy

### Admin (Requires Admin Role)
- `GET /admin` - Admin dashboard
- `GET /admin/sessions` - All sessions
- `DELETE /admin/sessions/:id` - Force delete any session

## Development

### Session Manager
```bash
cd session-manager
npm install
npm start
```

### X11 Web Bridge
```bash
cd x11-web-bridge
docker build -t x11-web-bridge .

# Test directly
docker run -p 6080:6080 x11-web-bridge
# Access at http://localhost:6080/vnc.html
```

## Project Structure

```
x11-to-html/
├── session-manager/           # Node.js session management
│   ├── config/               # MSAL configuration
│   ├── middleware/           # Auth middleware
│   ├── routes/              # API routes
│   │   ├── auth.js          # EntraID authentication
│   │   ├── sessions.js      # Session CRUD
│   │   ├── proxy.js         # Authenticated proxy
│   │   └── admin.js         # Admin functions
│   ├── services/            
│   │   └── sessionManager.js # Docker orchestration
│   ├── views/               # EJS templates
│   └── public/              # Static assets
│
└── x11-web-bridge/           # Docker image
    ├── Dockerfile
    ├── supervisord.conf     # Process management
    └── scripts/             # Startup scripts
```

## Container Lifecycle

1. **Create**: User requests new session
2. **Start**: Docker starts container with unique port mapping
3. **Run**: Container runs Xvfb, noVNC, and xterm
4. **Access**: User connects via authenticated proxy
5. **Monitor**: Session manager tracks xterm process
6. **Cleanup**: Container stopped/removed on:
   - User delete request
   - xterm process exit
   - Server shutdown

## License

MIT
