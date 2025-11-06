require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const adminRoutes = require('./routes/admin');
const { isAuthenticated, isAdmin } = require('./middleware/auth');
const SessionManager = require('./services/sessionManager');

const app = express();
const PORT = process.env.PORT || 3000;
const sessionManager = new SessionManager();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Routes
app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        res.render('index', { user: null });
    }
});

app.get('/dashboard', isAuthenticated, (req, res) => {
    res.render('dashboard', { user: req.session.user });
});

// Make sessionManager available to routes
app.locals.sessionManager = sessionManager;

app.use('/auth', authRoutes);
app.use('/sessions', isAuthenticated, sessionRoutes);
app.use('/admin', isAuthenticated, isAdmin, adminRoutes);

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

const server = app.listen(PORT, () => {
    console.log(`Session Manager running on http://localhost:${PORT}`);
});

// Graceful shutdown handler
async function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Cleaning up...`);
    
    try {
        // Stop accepting new connections
        server.close(() => {
            console.log('HTTP server closed');
        });
        
        // Clean up all sessions
        console.log('Destroying all active sessions...');
        await sessionManager.destroyAllSessions();
        console.log('All sessions destroyed');
        
        // Exit process
        process.exit(0);
    } catch (error) {
        console.error('Error during cleanup:', error);
        process.exit(1);
    }
}

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});
