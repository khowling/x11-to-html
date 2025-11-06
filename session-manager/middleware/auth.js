function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/auth/login');
}

function isAdmin(req, res, next) {
    const adminUsers = (process.env.ADMIN_USERS || '').split(',').map(u => u.trim());
    
    if (req.session && req.session.user && adminUsers.includes(req.session.user.email)) {
        return next();
    }
    
    res.status(403).json({ error: 'Access denied. Admin privileges required.' });
}

module.exports = {
    isAuthenticated,
    isAdmin
};
