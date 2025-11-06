
#  Session Manager

A Node.js web application that manages user-specific X11 sessions through Docker containers with EntraID authentication.

## Features

- **EntraID Authentication**: Secure authentication using Microsoft EntraID (Azure AD)
- **Session Management**: Automatically creates and manages user-specific X11 sessions
- **Docker Integration**: Launches isolated x11-web-bridge containers per user
- **Web-based Access**: Access X11 applications through any web browser
- **Admin Dashboard**: Monitor and manage all active sessions
- **Auto-cleanup**: Containers are automatically removed when stopped

## How It Works

1. User authenticates via EntraID
2. System checks for existing user session
3. If no session exists:
   - Launches a dedicated x11-web-bridge container on a unique port
   - Starts an xterm process connected to the user's display
   - Redirects user to their web-accessible X11 session
4. If session exists:
   - Redirects user to their existing session URL

## Setup

### Prerequisites

- Node.js 16+ and npm
- Docker installed and running
- x11-web-bridge Docker image built (from ../x11-web-bridge)
- Azure EntraID application registration with client secret

### 1. Build the x11-web-bridge Image

```bash
cd ../x11-web-bridge
docker build -t x11-web-bridge .
```

### 2. Install Dependencies

```bash
cd ../session-manager
npm install
```

### 3. Configure Environment

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` and configure:

```env
# Azure EntraID Configuration
CLIENT_ID=c89f4570-af8e-4502-9248-558679bc7b19
TENANT_ID=828514f2-d386-436c-8148-4bea696025bd
CLIENT_SECRET=<your-client-secret>
REDIRECT_URI=http://localhost:3000/auth/callback

# Session Configuration
SESSION_SECRET=<generate-a-random-secret>

# Application Configuration
PORT=3000
HOST=localhost

# Docker Configuration
X11_BRIDGE_IMAGE=x11-web-bridge
X11_BRIDGE_BASE_PORT=6080

# Admin Users (comma-separated email addresses)
ADMIN_USERS=admin@yourdomain.com
```

### 4. Azure EntraID App Registration

Ensure your Azure app registration has:
- **Redirect URI**: `http://localhost:3000/auth/callback` (or your deployment URL)
- **API Permissions**: `User.Read` (Microsoft Graph)
- **Client Secret**: Generated and added to `.env`

### 5. Start the Application

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Usage

### User Workflow

1. Navigate to `http://localhost:3000`
2. Click "Login with EntraID"
3. Authenticate with your corporate credentials
4. Click "Start New Session" to launch your X11 environment
5. Access your X11 applications through the web interface

### Admin Features

Admins (configured in `ADMIN_USERS`) can:
- View all active sessions
- Monitor system statistics
- Terminate user sessions
- Access the admin dashboard at `/admin`

## API Endpoints

### Authentication
- `GET /auth/login` - Initiate EntraID login
- `GET /auth/callback` - OAuth callback
- `GET /auth/logout` - Logout

### Session Management
- `GET /sessions/status` - Check user's session status
- `POST /sessions/create` - Create new session
- `GET /sessions/url` - Get session URL
- `DELETE /sessions/destroy` - End user session

### Admin (requires admin privileges)
- `GET /admin` - Admin dashboard
- `GET /admin/sessions` - List all sessions
- `DELETE /admin/sessions/:userId` - Kill specific user session
- `GET /admin/stats` - System statistics

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Browser   │────▶│  Session Manager │────▶│  Docker Engine   │
│             │     │   (Node.js/API)  │     │                  │
└─────────────┘     └──────────────────┘     └──────────────────┘
                            │                         │
                            │                         ▼
                            │                 ┌──────────────────┐
                            │                 │ x11-web-bridge-1 │
                            │                 │   (Port 6080)    │
                            │                 └──────────────────┘
                            │                         │
                            │                         ▼
                            │                 ┌──────────────────┐
                            └────────────────▶│  xterm process   │
                                             │  (DISPLAY :0)    │
                                             └──────────────────┘
```

## Security Considerations

- **Session Secret**: Use a strong random secret in production
- **HTTPS**: Always use HTTPS in production (set `cookie.secure = true`)
- **Client Secret**: Never commit the client secret to version control
- **Admin Users**: Carefully control who has admin access
- **Container Isolation**: Each user gets an isolated Docker container

## Troubleshooting

### Docker Connection Issues
Ensure Docker daemon is running:
```bash
docker ps
```

### Port Conflicts
If base port 6080 is in use, change `X11_BRIDGE_BASE_PORT` in `.env`

### Authentication Errors
- Verify EntraID credentials in `.env`
- Check redirect URI matches Azure app registration
- Ensure client secret is valid

### Container Won't Start
Check if the x11-web-bridge image exists:
```bash
docker images | grep x11-web-bridge
```

## Development

Project structure:
```
session-manager/
├── config/           # MSAL and configuration
├── middleware/       # Authentication middleware
├── routes/          # Express routes
├── services/        # SessionManager service
├── views/           # EJS templates
├── public/          # Static assets (CSS)
├── server.js        # Main application
└── package.json
```

## Authentication Details

- **Client ID**: `c89f4570-af8e-4502-9248-558679bc7b19`
- **Tenant ID**: `828514f2-d386-436c-8148-4bea696025bd`
- **Authorization Endpoint**: `https://login.microsoftonline.com/828514f2-d386-436c-8148-4bea696025bd/oauth2/v2.0/authorize`
- **Token Endpoint**: `https://login.microsoftonline.com/828514f2-d386-436c-8148-4bea696025bd/oauth2/v2.0/token`

## License

MIT


