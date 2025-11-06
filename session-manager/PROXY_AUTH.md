# Proxy Authentication System

## Overview
All access to X11 session containers is now protected by **session cookie authentication** (the same EntraID authentication used throughout the app). Users cannot access containers directly - they must go through the authenticated proxy route.

## Architecture

### Flow
1. User authenticates via EntraID (gets session cookie)
2. User creates a session via `/sessions/create`
3. Session URL points to proxy route: `/proxy/:sessionId/*`
4. All requests to containers go through proxy with session cookie validation
5. Proxy verifies user owns the session before forwarding to container

### Why Session Cookies Instead of Bearer Tokens?

**Session Cookie Approach** (implemented):
- ✅ Reuses existing EntraID authentication
- ✅ Simpler - no separate token management needed
- ✅ Consistent with the rest of the application
- ✅ Automatic session management (timeouts, renewals)
- ✅ Browser handles cookie automatically

**Bearer Token Approach** (not used):
- Would require separate token generation and storage
- Additional complexity for token expiry and revocation
- Overkill for browser-based access
- Better suited for API access or mobile apps

### Components

#### Authentication Middleware (`routes/proxy.js`)
```javascript
authenticateSession(req, res, next)
```
- Checks if user has valid session cookie
- Extracts sessionId from URL
- Verifies session exists
- Verifies user owns the session
- Attaches session data to request

### Proxy Route (`/proxy/:sessionId/*`)

**Authentication**: Session cookie (from EntraID login)

**Validation Steps**:
1. Check if user is authenticated (has session cookie)
2. Extract sessionId from URL
3. Verify session exists in sessionManager
4. Verify session.userId matches req.session.user.id
5. Proxy request to container on `localhost:port`

**Features**:
- HTTP and WebSocket proxying via `http-proxy-middleware`
- Path rewriting to remove `/proxy/:sessionId` prefix
- Error handling for container unavailability
- Automatic cookie forwarding (handled by browser)

### Security Features

#### 1. **User Isolation**
- Each request validates userId matches session owner
- Users cannot access other users' sessions
- Session ownership verified on every request

#### 2. **Session Binding**
- Leverages existing EntraID session management
- 24-hour session timeout (configurable)
- Automatic session renewal

#### 3. **No Direct Container Access**
- Containers listen only on localhost
- No external access without going through proxy
- All access authenticated via EntraID

#### 4. **Consistent Authentication**
- Same authentication mechanism as dashboard
- Single logout invalidates all access
- No additional credential management

### URL Format

#### Old (Direct Access - Insecure):
```
http://localhost:6080/vnc.html?autoconnect=true
```

#### New (Proxied Access - Secure):
```
http://localhost:3000/proxy/session-123-abc/vnc.html?autoconnect=true&resize=scale
```

### Session Object Updates

Sessions now include proxied URL:
```javascript
{
  sessionId: 'session-1234567890-abc123',
  userId: 'user-guid',
  username: 'user@example.com',
  containerId: 'docker-container-id',
  port: 6080,  // Container port (for internal use)
  url: 'http://localhost:6080/...',  // Direct access (deprecated)
  proxyUrl: 'http://localhost:3000/proxy/...',  // Proxied access (secure)
  createdAt: Date
}
```

### API Endpoints

#### GET/POST `/proxy/:sessionId/*`
Proxy all requests to the container.

**Authentication**: Session cookie (EntraID)

**Example**:
```
GET /proxy/session-123-abc/vnc.html?autoconnect=true
Cookie: connect.sid=s%3A...
```

### Implementation Details

#### Session Validation
```javascript
// Check authentication
if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
}

// Verify session ownership
if (session.userId !== req.session.user.id) {
    return res.status(403).json({ error: 'Access denied' });
}
```

#### WebSocket Support
- `http-proxy-middleware` handles WebSocket upgrades automatically
- Session cookie validated before WebSocket upgrade
- Maintains persistent connection after authentication

#### Error Responses

| Code | Reason |
|------|--------|
| 401 | Not authenticated (no session cookie) |
| 403 | Access denied (session belongs to another user) |
| 404 | Session not found |
| 502 | Container unreachable |

### Configuration

**Session Timeout** (in `server.js`):
```javascript
cookie: {
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
}
```

**Proxy Logging** (in `routes/proxy.js`):
```javascript
logLevel: 'warn'  // Options: 'debug', 'info', 'warn', 'error', 'silent'
```

### Testing

1. **Login via EntraID**:
   ```
   Navigate to http://localhost:3000
   Click "Sign in with EntraID"
   ```

2. **Create a session** (authenticated):
   ```
   Click "Create New Session" on dashboard
   ```

3. **Access via proxy** (uses session cookie automatically):
   ```
   Click "Open" button on session card
   Opens: http://localhost:3000/proxy/session-123/vnc.html
   ```

4. **Test unauthorized access** (should redirect to login):
   ```bash
   curl http://localhost:3000/proxy/session-123/vnc.html
   # Returns 401 or redirects to login
   ```

### Production Considerations

1. **HTTPS Required**: Session cookies should be secure=true in production
2. **Firewall Rules**: Ensure container ports (6080+) are not exposed externally
3. **Session Store**: Use Redis or database instead of memory store for production
4. **Rate Limiting**: Add rate limiting to proxy endpoints
5. **Audit Logging**: Log all access attempts for security monitoring
6. **CORS**: Configure CORS if accessing from different domains
