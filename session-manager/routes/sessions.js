const express = require('express');
const router = express.Router();
const { removeProxyForSession } = require('./proxy');

// Get user's all sessions
router.get('/', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const userId = req.session.user.id;
        const userSessions = sessionManager.getUserSessions(userId);
        
        res.json({ sessions: userSessions });
    } catch (error) {
        console.error('Error getting user sessions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create a new session for the user (with Server-Sent Events for progress)
// NOTE: This MUST come before /:sessionId route to avoid matching "create" as a sessionId
router.get('/create', async (req, res) => {
    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendProgress = (step, message) => {
        res.write(`data: ${JSON.stringify({ step, message })}\n\n`);
    };

    const sendComplete = (session) => {
        res.write(`data: ${JSON.stringify({ complete: true, session })}\n\n`);
        res.end();
    };

    const sendError = (error) => {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    };

    try {
        const sessionManager = req.app.locals.sessionManager;
        const userId = req.session.user.id;
        const username = req.session.user.username;
        
        // Create new session with progress updates
        sendProgress('init', 'Initializing session...');
        
        const userSession = await sessionManager.createSessionWithProgress(userId, username, sendProgress);
        
        // Build proxied URL with WebSocket path parameter
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const sessionPath = `/proxy/${userSession.sessionId}`;
        // noVNC path parameter should be relative (without leading /)
        userSession.proxyUrl = `${baseUrl}${sessionPath}/vnc.html?autoconnect=true&resize=scale&path=proxy/${userSession.sessionId}/websockify`;
        
        sendProgress('complete', 'Session created successfully!');
        sendComplete(userSession);
    } catch (error) {
        console.error('Error creating session:', error);
        sendError(error);
    }
});

// Get specific session status
router.get('/:sessionId', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const userId = req.session.user.id;
        const sessionId = req.params.sessionId;
        const userSession = await sessionManager.getUserSession(userId, sessionId);
        
        if (userSession) {
            res.json({ session: userSession });
        } else {
            res.status(404).json({ error: 'Session not found' });
        }
    } catch (error) {
        console.error('Error getting session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete a specific user's session
router.delete('/:sessionId', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const userId = req.session.user.id;
        const sessionId = req.params.sessionId;
        
        // Remove proxy from cache
        removeProxyForSession(sessionId);
        
        const result = await sessionManager.destroySession(userId, sessionId);
        
        if (result) {
            res.json({ success: true, message: 'Session destroyed' });
        } else {
            res.status(404).json({ error: 'Session not found or access denied' });
        }
    } catch (error) {
        console.error('Error destroying session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete all user's sessions
router.delete('/', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const userId = req.session.user.id;
        const count = await sessionManager.destroyUserSessions(userId);
        
        res.json({ success: true, message: `${count} session(s) destroyed` });
    } catch (error) {
        console.error('Error destroying sessions:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
