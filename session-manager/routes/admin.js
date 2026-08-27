const express = require('express');
const router = express.Router();

// Admin dashboard
router.get('/', (req, res) => {
    res.render('admin', { user: req.session.user });
});

// Get all active sessions
router.get('/sessions', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const sessions = await sessionManager.getAllSessions();
        res.json({ sessions });
    } catch (error) {
        console.error('Error getting all sessions:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/sessions/:sessionId/launch', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const launchUrl = await sessionManager.createAdminSessionLaunchUrl(req.params.sessionId);

        if (!launchUrl) {
            return res.status(404).send('Session not found or no longer active');
        }

        return res.redirect(303, launchUrl);
    } catch (error) {
        console.error('Error launching session as administrator:', error);
        return res.status(502).send('Unable to authenticate with Apache Guacamole');
    }
});

// Kill a specific session by ID
router.delete('/sessions/:sessionId', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const sessionId = req.params.sessionId;
        
        // Get session to find userId
        const session = sessionManager.sessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        await sessionManager.destroySession(session.userId, sessionId);
        
        res.json({ 
            success: true, 
            message: `Session ${sessionId} for user ${session.username} destroyed` 
        });
    } catch (error) {
        console.error('Error destroying session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get system statistics
router.get('/stats', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const stats = await sessionManager.getSystemStats();
        res.json(stats);
    } catch (error) {
        console.error('Error getting system stats:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
