const express = require('express');
const router = express.Router();
const { createProxyMiddleware } = require('http-proxy-middleware');

// Cache proxy middleware instances by sessionId to avoid recreating them
const proxyCache = new Map();

/**
 * Get or create proxy middleware for a session
 */
function getProxyForSession(session) {
    const sessionId = session.sessionId;
    
    if (!proxyCache.has(sessionId)) {
        const proxy = createProxyMiddleware({
            target: `http://localhost:${session.port}`,
            changeOrigin: true,
            // Note: WebSocket upgrades are handled manually in router.ws()
            pathRewrite: (path, req) => {
                // Remove /proxy/:sessionId from the path
                // e.g., /proxy/session-123/vnc.html -> /vnc.html
                const proxyPrefix = `/proxy/${sessionId}`;
                if (path.startsWith(proxyPrefix)) {
                    const rewritten = path.substring(proxyPrefix.length) || '/';
                    console.log(`[${sessionId}] Path rewrite: ${path} -> ${rewritten}`);
                    return rewritten;
                }
                return path;
            },
            onProxyReq: (proxyReq, req, res) => {
                console.log(`[${sessionId}] HTTP: ${req.method} ${req.url} -> http://localhost:${session.port}${proxyReq.path}`);
            },
            onError: (err, req, res) => {
                console.error(`[${sessionId}] Proxy error:`, err.message);
                if (!res.headersSent && res.writeHead) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Bad Gateway', details: err.message }));
                }
            },
            logLevel: 'warn'
        });
        
        proxyCache.set(sessionId, proxy);
        console.log(`Created proxy for session ${sessionId} -> localhost:${session.port}`);
    }
    
    return proxyCache.get(sessionId);
}

/**
 * Remove proxy from cache when session is destroyed
 */
function removeProxyForSession(sessionId) {
    if (proxyCache.has(sessionId)) {
        proxyCache.delete(sessionId);
        console.log(`Removed proxy for session ${sessionId}`);
    }
}

/**
 * Middleware to validate session cookie and verify user owns the session
 */
function authenticateSession(req, res, next) {
    // Check if user is authenticated via session cookie
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const sessionManager = req.app.locals.sessionManager;
    const sessionId = req.params.sessionId;
    const userId = req.session.user.id;

    // Get session details
    const session = sessionManager.sessions.get(sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    // Verify user owns this session
    if (session.userId !== userId) {
        return res.status(403).json({ error: 'Access denied - session belongs to another user' });
    }

    // Attach session data to request for use by proxy
    req.x11Session = session;
    next();
}

/**
 * Proxy route for noVNC and WebSocket connections
 * All requests are authenticated via session cookie
 */
router.use('/:sessionId', authenticateSession, (req, res, next) => {
    const session = req.x11Session;
    
    // Get or create cached proxy for this session
    const proxy = getProxyForSession(session);
    
    // Use the proxy middleware
    proxy(req, res, next);
});

/**
 * WebSocket upgrade handler for noVNC
 * Setup function to be called from server.js
 */
router.ws = function(app) {
    const server = app.get('server');
    const http = require('http');
    const cookie = require('cookie');
    const signature = require('cookie-signature');
    
    // Get session secret from environment
    const sessionSecret = process.env.SESSION_SECRET || 'your-secret-key';
    
    server.on('upgrade', (req, socket, head) => {
        console.log(`[UPGRADE] Request received: ${req.url}`);
        console.log(`[UPGRADE] Headers:`, JSON.stringify(req.headers, null, 2));
        
        // Check if this is a proxy WebSocket request
        const urlMatch = req.url.match(/^\/proxy\/([^\/\?]+)/);
        if (!urlMatch) {
            console.log(`[UPGRADE] Not a proxy request, ignoring`);
            return; // Not a proxy request, ignore
        }
        
        const sessionId = urlMatch[1];
        console.log(`WebSocket upgrade request for session: ${sessionId}, URL: ${req.url}`);
        
        // Parse cookies from the request
        const cookies = cookie.parse(req.headers.cookie || '');
        console.log(`  Cookies present: ${Object.keys(cookies).join(', ')}`);
        
        // Get the session ID from cookie (connect.sid by default)
        let sessionCookie = cookies['connect.sid'];
        if (!sessionCookie) {
            console.error(`WebSocket upgrade denied: No session cookie found`);
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        
        // Decode the signed cookie
        if (sessionCookie.startsWith('s:')) {
            sessionCookie = signature.unsign(sessionCookie.slice(2), sessionSecret);
            if (sessionCookie === false) {
                console.error(`WebSocket upgrade denied: Invalid session signature`);
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
        }
        
        console.log(`  Session cookie ID: ${sessionCookie}`);
        
        // Get session from store (in-memory for now)
        // Note: We need to access the session store, but it's not directly available
        // For now, we'll validate that a session exists and proceed
        // TODO: Implement proper session store lookup
        
        const sessionManager = app.locals.sessionManager;
        const session = sessionManager.sessions.get(sessionId);
        
        if (!session) {
            console.error(`WebSocket upgrade denied: Session ${sessionId} not found`);
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
        }
        
        // Rewrite the URL to remove the /proxy/:sessionId prefix
        const proxyPrefix = `/proxy/${sessionId}`;
        const targetPath = req.url.startsWith(proxyPrefix) 
            ? req.url.substring(proxyPrefix.length) || '/'
            : req.url;
        
        console.log(`WebSocket upgrade approved for session ${sessionId}`);
        console.log(`  Path: ${req.url} -> ${targetPath}`);
        console.log(`  Target: ws://localhost:${session.port}${targetPath}`);
        
        // Create proxy request to the container
        const proxyReq = http.request({
            hostname: 'localhost',
            port: session.port,
            path: targetPath,
            headers: {
                'Connection': 'Upgrade',
                'Upgrade': 'websocket',
                'Sec-WebSocket-Version': req.headers['sec-websocket-version'],
                'Sec-WebSocket-Key': req.headers['sec-websocket-key'],
                'Sec-WebSocket-Protocol': req.headers['sec-websocket-protocol'],
                'Sec-WebSocket-Extensions': req.headers['sec-websocket-extensions']
            }
        });
        
        proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
            console.log(`[${sessionId}] WebSocket connection established`);
            
            // Forward the upgrade response to the client
            socket.write(`HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`);
            Object.keys(proxyRes.headers).forEach(key => {
                socket.write(`${key}: ${proxyRes.headers[key]}\r\n`);
            });
            socket.write('\r\n');
            socket.write(proxyHead);
            
            // Pipe data between client and container
            proxySocket.pipe(socket);
            socket.pipe(proxySocket);
            
            // Handle errors and cleanup
            proxySocket.on('error', (err) => {
                console.error(`[${sessionId}] Proxy socket error:`, err.message);
                socket.destroy();
            });
            
            socket.on('error', (err) => {
                console.error(`[${sessionId}] Client socket error:`, err.message);
                proxySocket.destroy();
            });
            
            proxySocket.on('close', () => {
                console.log(`[${sessionId}] WebSocket connection closed (proxy side)`);
                socket.destroy();
            });
            
            socket.on('close', () => {
                console.log(`[${sessionId}] WebSocket connection closed (client side)`);
                proxySocket.destroy();
            });
        });
        
        proxyReq.on('error', (err) => {
            console.error(`[${sessionId}] WebSocket proxy request error:`, err.message);
            socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            socket.destroy();
        });
        
        // Send the upgrade request
        proxyReq.end();
    });
    
    console.log('WebSocket proxy support enabled with session authentication');
};

// Export functions for use by other routes
module.exports = router;
module.exports.removeProxyForSession = removeProxyForSession;
