const express = require('express');
const router = express.Router();
const msal = require('@azure/msal-node');
const { msalConfig, REDIRECT_URI, SCOPES } = require('../config/msalConfig');

const msalInstance = new msal.ConfidentialClientApplication(msalConfig);
const cryptoProvider = new msal.CryptoProvider();

// Login route
router.get('/login', async (req, res) => {
    try {
        // Generate PKCE codes
        const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
        
        // Store the verifier in session
        req.session.pkceCodes = {
            challengeMethod: 'S256',
            verifier: verifier,
            challenge: challenge,
        };

        const authCodeUrlParameters = {
            scopes: SCOPES,
            redirectUri: REDIRECT_URI,
            codeChallenge: challenge,
            codeChallengeMethod: 'S256'
        };

        // Get auth code URL
        const authCodeUrl = await msalInstance.getAuthCodeUrl(authCodeUrlParameters);
        res.redirect(authCodeUrl);
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('Authentication error');
    }
});

// Callback route
router.get('/callback', async (req, res) => {
    try {
        // Check for errors from Azure
        if (req.query.error) {
            console.error('Azure auth error:', req.query.error);
            console.error('Error description:', req.query.error_description);
            return res.status(400).send(`
                <h1>Authentication Error</h1>
                <p><strong>Error:</strong> ${req.query.error}</p>
                <p><strong>Description:</strong> ${req.query.error_description || 'No description provided'}</p>
                <p><a href="/">Return to Home</a></p>
            `);
        }

        // Check if we have an auth code
        if (!req.query.code) {
            console.error('No authorization code received');
            return res.status(400).send(`
                <h1>Authentication Error</h1>
                <p>No authorization code received from Azure.</p>
                <p><a href="/">Return to Home</a></p>
            `);
        }

        // Check if session has PKCE codes
        if (!req.session.pkceCodes) {
            console.error('No PKCE codes found in session');
            return res.status(400).send(`
                <h1>Authentication Error</h1>
                <p>Session expired. Please try logging in again.</p>
                <p><a href="/auth/login">Login Again</a></p>
            `);
        }

        console.log('Exchanging auth code for token...');
        const tokenRequest = {
            code: req.query.code,
            scopes: SCOPES,
            redirectUri: REDIRECT_URI,
            codeVerifier: req.session.pkceCodes.verifier,
        };

        const response = await msalInstance.acquireTokenByCode(tokenRequest);
        console.log('Token acquired successfully');
        
        // Store user info in session
        req.session.user = {
            id: response.account.homeAccountId,
            username: response.account.username,
            name: response.account.name,
            email: response.account.username
        };

        console.log('User authenticated:', req.session.user.username);

        // Clean up PKCE codes
        delete req.session.pkceCodes;

        res.redirect('/dashboard');
    } catch (error) {
        console.error('Callback error details:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        res.status(500).send(`
            <h1>Authentication Failed</h1>
            <p><strong>Error:</strong> ${error.message}</p>
            <p>Please check the server logs for more details.</p>
            <p><a href="/">Return to Home</a></p>
        `);
    }
});

// Logout route
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

module.exports = router;
