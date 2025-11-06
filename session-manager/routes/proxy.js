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
    
    const sessionSecret = process.env.SESSION_SECRET || 'your-secret-key';
    
    server.on('upgrade', (req, socket, head) => {
        // Check if this is a proxy WebSocket request
        const urlMatch = req.url.match(/^\/proxy\/([^\/\?]+)/);
        if (!urlMatch) {
            return; // Not a proxy request, ignore
        }
        
        const sessionId = urlMatch[1];
        console.log(`[${sessionId}] WebSocket upgrade: ${req.url}`);
        
        // Parse and validate session cookie
        const cookies = cookie.parse(req.headers.cookie || '');
        let sessionCookie = cookies['connect.sid'];
        
        if (!sessionCookie) {
            console.error(`[${sessionId}] WebSocket denied: No session cookie`);
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        
        // Verify signed cookie
        if (sessionCookie.startsWith('s:')) {
            sessionCookie = signature.unsign(sessionCookie.slice(2), sessionSecret);
            if (sessionCookie === false) {
                console.error(`[${sessionId}] WebSocket denied: Invalid signature`);
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
        }
        
        // Verify session exists
        const sessionManager = app.locals.sessionManager;
        const session = sessionManager.sessions.get(sessionId);
        
        if (!session) {
            console.error(`[${sessionId}] WebSocket denied: Session not found`);
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
        }
        
        // Rewrite URL path for container
        const proxyPrefix = `/proxy/${sessionId}`;
        const targetPath = req.url.startsWith(proxyPrefix) 
            ? req.url.substring(proxyPrefix.length) || '/'
            : req.url;
        
        console.log(`[${sessionId}] Proxying to ws://localhost:${session.port}${targetPath}`);
        
        // Create WebSocket upgrade request to container
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
            console.log(`[${sessionId}] WebSocket connected`);
            
            // Forward upgrade response to client
            socket.write(`HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`);
            Object.keys(proxyRes.headers).forEach(key => {
                socket.write(`${key}: ${proxyRes.headers[key]}\r\n`);
            });
            socket.write('\r\n');
            socket.write(proxyHead);
            
            // Bidirectional pipe between client and container
            proxySocket.pipe(socket);
            socket.pipe(proxySocket);
            
            // Cleanup handlers
            const cleanup = () => {
                socket.destroy();
                proxySocket.destroy();
            };
            
            proxySocket.on('error', (err) => {
                console.error(`[${sessionId}] Proxy socket error:`, err.message);
                cleanup();
            });
            
            socket.on('error', (err) => {
                console.error(`[${sessionId}] Client socket error:`, err.message);
                cleanup();
            });
            
            proxySocket.on('close', () => {
                console.log(`[${sessionId}] WebSocket closed`);
                cleanup();
            });
            
            socket.on('close', () => cleanup());
        });
        
        proxyReq.on('error', (err) => {
            console.error(`[${sessionId}] WebSocket proxy error:`, err.message);
            socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            socket.destroy();
        });
        
        proxyReq.end();
    });
    
    console.log('WebSocket proxy support enabled with session authentication');
};

// Export functions for use by other routes
module.exports = router;
module.exports.removeProxyForSession = removeProxyForSession;
