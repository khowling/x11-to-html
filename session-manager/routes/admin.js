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

// Kill a specific user's session
router.delete('/sessions/:userId', async (req, res) => {
    try {
        const sessionManager = req.app.locals.sessionManager;
        const userId = req.params.userId;
        await sessionManager.destroySession(userId);
        
        res.json({ 
            success: true, 
            message: `Session for user ${userId} destroyed` 
        });
    } catch (error) {
        console.error('Error destroying user session:', error);
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
