const express = require('express');
const router = express.Router();

// Get user's session status
router.get('/status', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const userId = req.session.user.id;
        const userSession = await sessionManager.getUserSession(userId);
        
        if (userSession) {
            res.json({
                exists: true,
                session: userSession
            });
        } else {
            res.json({ exists: false });
        }
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
        
        // Check if session already exists
        let userSession = await sessionManager.getUserSession(userId);
        
        if (userSession) {
            // Session exists, redirect to it
            return res.json({
                success: true,
                exists: true,
                url: userSession.url
            });
        }

        // Create new session
        userSession = await sessionManager.createSession(userId, username);
        
        res.json({
            success: true,
            exists: false,
            session: userSession
        });
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get the session URL
router.get('/url', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const userId = req.session.user.id;
        const userSession = await sessionManager.getUserSession(userId);
        
        if (!userSession) {
            return res.status(404).json({ error: 'No active session found' });
        }

        res.json({ url: userSession.url });
    } catch (error) {
        console.error('Error getting session URL:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete user's session
router.delete('/destroy', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const userId = req.session.user.id;
        await sessionManager.destroySession(userId);
        
        res.json({ success: true, message: 'Session destroyed' });
    } catch (error) {
        console.error('Error destroying session:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
