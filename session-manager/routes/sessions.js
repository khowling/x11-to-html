const express = require('express');
const router = express.Router();

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

// Get user's session status (legacy - returns all sessions)
router.get('/status', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const userId = req.session.user.id;
        const userSessions = sessionManager.getUserSessions(userId);
        
        res.json({ 
            sessions: userSessions,
            count: userSessions.length
        });
    } catch (error) {
        console.error('Error getting session status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create a new session for the user
router.post('/create', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const userId = req.session.user.id;
        const username = req.session.user.username;
        
        // Create new session
        const userSession = await sessionManager.createSession(userId, username);
        
        res.json({
            success: true,
            session: userSession
        });
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete a specific user's session
router.delete('/:sessionId', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const userId = req.session.user.id;
        const sessionId = req.params.sessionId;
        
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
