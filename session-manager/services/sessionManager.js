const Docker = require('dockerode');
const { spawn } = require('child_process');

const docker = new Docker();

class SessionManager {
    constructor() {
        // Store sessions by sessionId, with userId index
        // sessions: Map<sessionId, sessionObject>
        // userSessions: Map<userId, Set<sessionId>>
        this.sessions = new Map();
        this.userSessions = new Map();
        this.basePort = parseInt(process.env.X11_BRIDGE_BASE_PORT) || 6080;
        this.bridgeImage = process.env.X11_BRIDGE_IMAGE || 'x11-web-bridge';
    }

    /**
     * Generate a unique session ID
     */
    generateSessionId() {
        return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get the next available port
     */
    async getNextAvailablePort() {
        let port = this.basePort;
        const usedPorts = new Set(
            Array.from(this.sessions.values()).map(s => s.port)
        );

        while (usedPorts.has(port)) {
            port++;
        }

        return port;
    }

    /**
     * Get all sessions for a user
     */
    getUserSessions(userId) {
        const sessionIds = this.userSessions.get(userId) || new Set();
        const userSessions = [];
        
        for (const sessionId of sessionIds) {
            const session = this.sessions.get(sessionId);
            if (session) {
                userSessions.push(session);
            }
        }
        
        return userSessions;
    }

    /**
     * Get a specific session by ID (only if it belongs to the user)
     */
    async getUserSession(userId, sessionId) {
        const session = this.sessions.get(sessionId);
        
        if (!session || session.userId !== userId) {
            return null;
        }

        // Verify the session is still active
        try {
            const container = docker.getContainer(session.containerId);
            const info = await container.inspect();
            
            if (info.State.Running) {
                return session;
            } else {
                // Container stopped, clean up
                this.removeSession(sessionId);
                return null;
            }
        } catch (error) {
            // Container doesn't exist, clean up
            this.removeSession(sessionId);
            return null;
        }
    }

    /**
     * Remove a session from tracking
     */
    removeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            const userSessionIds = this.userSessions.get(session.userId);
            if (userSessionIds) {
                userSessionIds.delete(sessionId);
                if (userSessionIds.size === 0) {
                    this.userSessions.delete(session.userId);
                }
            }
            this.sessions.delete(sessionId);
        }
    }

    /**
     * Create a new session for a user
     */
    async createSession(userId, username) {
        const sessionId = this.generateSessionId();
        console.log(`Creating session ${sessionId} for user: ${username} (${userId})`);

        // Get available port
        const port = await this.getNextAvailablePort();
        const displayNum = port - this.basePort;
        const containerName = `x11-bridge-${sessionId}`;

        try {
            // Check if a container with this name already exists and remove it
            try {
                const existingContainer = docker.getContainer(containerName);
                const info = await existingContainer.inspect();
                console.log(`Found existing container ${containerName}, removing it...`);
                
                if (info.State.Running) {
                    await existingContainer.stop({ t: 5 });
                }
                await existingContainer.remove();
                console.log(`Removed existing container ${containerName}`);
            } catch (error) {
                // Container doesn't exist, which is fine
                if (error.statusCode !== 404) {
                    console.error('Error checking for existing container:', error.message);
                }
            }

            // Launch x11-web-bridge container
            console.log(`Starting container ${containerName} on port ${port}`);
            
            // X11 port calculation: container always uses :1 (port 6001), map to unique host port
            const x11Port = 6001 + displayNum;
            
            const container = await docker.createContainer({
                Image: this.bridgeImage,
                name: containerName,
                Env: [
                    `DISPLAY=:1`,
                    `VNC_PORT=5901`,
                    `WEB_PORT=6080`,  // Container internal noVNC port (fixed)
                    `USER_ID=${userId}`,
                    `USERNAME=${username}`,
                    `SESSION_ID=${sessionId}`
                ],
                ExposedPorts: {
                    '6080/tcp': {},  // noVNC web port inside container (fixed at 6080)
                    '6001/tcp': {}   // X11 port for display :1 inside container
                },
                HostConfig: {
                    PortBindings: {
                        '6080/tcp': [{ HostPort: `${port}` }],  // Map container's 6080 to dynamic host port
                        '6001/tcp': [{ HostPort: `${x11Port}` }]  // Map container's 6001 to unique host port
                    },
                    AutoRemove: true,
                    ShmSize: 268435456 // 256MB shared memory
                },
                Labels: {
                    'x11-session-manager': 'true',
                    'user-id': userId,
                    'username': username,
                    'session-id': sessionId
                }
            });

            await container.start();
            console.log(`Container ${containerName} started`);

            // Wait for container to be ready (VNC server needs time to start)
            console.log('Waiting for VNC server to start...');
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Fork xterm process on host, connecting to container's X11 display
            // Container port 6001 is mapped to host port x11Port
            // X11 display number = port - 6000, so for x11Port 6001 -> display 1, 6002 -> display 2, etc.
            const displayNumber = x11Port - 6000;
            console.log(`Starting xterm process for display localhost:${displayNumber} (port ${x11Port})`);
            const xtermProcess = spawn('xterm', [
                '-display', `localhost:${displayNumber}`,
                '-maximized',  // Maximize the window
                '-fa', 'Monospace',
                '-fs', '12',
                '-title', `${username}'s Session ${sessionId}`
            ], {
                detached: false,  // Don't detach so we can monitor the process
                stdio: 'ignore'
            });

            const session = {
                sessionId,
                userId,
                username,
                containerId: container.id,
                containerName,
                port,
                displayNum,
                x11Port,
                xtermPid: xtermProcess.pid,
                url: `http://${process.env.HOST || 'localhost'}:${port}/vnc.html?autoconnect=true&resize=scale`,
                createdAt: new Date()
            };

            // Monitor xterm process and cleanup when it exits
            xtermProcess.on('exit', async (code, signal) => {
                console.log(`xterm process ${xtermProcess.pid} exited (code: ${code}, signal: ${signal})`);
                console.log(`Auto-cleanup: destroying session ${sessionId} for user ${username}`);
                
                try {
                    // Stop and remove container
                    const container = docker.getContainer(session.containerId);
                    await container.stop({ t: 5 });
                    console.log(`Stopped container ${session.containerName}`);
                    
                    // Remove from tracking
                    this.removeSession(sessionId);
                    console.log(`Session ${sessionId} cleaned up after xterm exit`);
                } catch (error) {
                    console.error(`Error during auto-cleanup of session ${sessionId}:`, error.message);
                    // Still remove from tracking even if container cleanup fails
                    this.removeSession(sessionId);
                }
            });

            this.sessions.set(sessionId, session);
            
            // Track user sessions
            if (!this.userSessions.has(userId)) {
                this.userSessions.set(userId, new Set());
            }
            this.userSessions.get(userId).add(sessionId);
            
            console.log(`Session created for ${username}:`, session);

            return session;
        } catch (error) {
            console.error('Error creating session:', error);
            
            // Cleanup on error
            try {
                const container = docker.getContainer(containerName);
                await container.remove({ force: true });
            } catch (cleanupError) {
                // Ignore cleanup errors
            }

            throw new Error(`Failed to create session: ${error.message}`);
        }
    }

    /**
     * Create a new session for a user with progress callbacks
     */
    async createSessionWithProgress(userId, username, progressCallback) {
        const sessionId = this.generateSessionId();
        console.log(`Creating session ${sessionId} for user: ${username} (${userId})`);

        // Get available port
        const port = await this.getNextAvailablePort();
        const displayNum = port - this.basePort;
        const containerName = `x11-bridge-${sessionId}`;

        try {
            // Check if a container with this name already exists and remove it
            try {
                const existingContainer = docker.getContainer(containerName);
                const info = await existingContainer.inspect();
                console.log(`Found existing container ${containerName}, removing it...`);
                
                if (info.State.Running) {
                    await existingContainer.stop({ t: 5 });
                }
                await existingContainer.remove();
                console.log(`Removed existing container ${containerName}`);
            } catch (error) {
                // Container doesn't exist, which is fine
                if (error.statusCode !== 404) {
                    console.error('Error checking for existing container:', error.message);
                }
            }

            // Launch x11-web-bridge container
            progressCallback('container', `Creating Docker container on port ${port}...`);
            console.log(`Starting container ${containerName} on port ${port}`);
            
            // X11 port calculation: container always uses :1 (port 6001), map to unique host port
            const x11Port = 6001 + displayNum;
            
            const container = await docker.createContainer({
                Image: this.bridgeImage,
                name: containerName,
                Env: [
                    `DISPLAY=:1`,
                    `VNC_PORT=5901`,
                    `WEB_PORT=6080`,  // Container internal noVNC port (fixed)
                    `USER_ID=${userId}`,
                    `USERNAME=${username}`,
                    `SESSION_ID=${sessionId}`
                ],
                ExposedPorts: {
                    '6080/tcp': {},  // noVNC web port inside container (fixed at 6080)
                    '6001/tcp': {}   // X11 port for display :1 inside container
                },
                HostConfig: {
                    PortBindings: {
                        '6080/tcp': [{ HostPort: `${port}` }],  // Map container's 6080 to dynamic host port
                        '6001/tcp': [{ HostPort: `${x11Port}` }]  // Map container's 6001 to unique host port
                    },
                    AutoRemove: true,
                    ShmSize: 268435456 // 256MB shared memory
                },
                Labels: {
                    'x11-session-manager': 'true',
                    'user-id': userId,
                    'username': username,
                    'session-id': sessionId
                }
            });

            progressCallback('starting', 'Starting container...');
            await container.start();
            console.log(`Container ${containerName} started`);

            // Wait for container to be ready (VNC server needs time to start)
            progressCallback('vnc', 'Waiting for VNC server to initialize...');
            console.log('Waiting for VNC server to start...');
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Fork xterm process on host, connecting to container's X11 display
            progressCallback('xterm', 'Starting xterm terminal application...');
            const displayNumber = x11Port - 6000;
            console.log(`Starting xterm process for display localhost:${displayNumber} (port ${x11Port})`);
            const xtermProcess = spawn('xterm', [
                '-display', `localhost:${displayNumber}`,
                '-maximized',  // Maximize the window
                '-fa', 'Monospace',
                '-fs', '12',
                '-title', `${username}'s Session ${sessionId}`
            ], {
                detached: false,  // Don't detach so we can monitor the process
                stdio: 'ignore'
            });

            const session = {
                sessionId,
                userId,
                username,
                containerId: container.id,
                containerName,
                port,
                displayNum,
                x11Port,
                xtermPid: xtermProcess.pid,
                url: `http://${process.env.HOST || 'localhost'}:${port}/vnc.html?autoconnect=true&resize=scale`,
                createdAt: new Date()
            };

            // Monitor xterm process and cleanup when it exits
            xtermProcess.on('exit', async (code, signal) => {
                console.log(`xterm process ${xtermProcess.pid} exited (code: ${code}, signal: ${signal})`);
                console.log(`Auto-cleanup: destroying session ${sessionId} for user ${username}`);
                
                try {
                    // Stop and remove container
                    const container = docker.getContainer(session.containerId);
                    await container.stop({ t: 5 });
                    console.log(`Stopped container ${session.containerName}`);
                    
                    // Remove from tracking
                    this.removeSession(sessionId);
                    console.log(`Session ${sessionId} cleaned up after xterm exit`);
                } catch (error) {
                    console.error(`Error during auto-cleanup of session ${sessionId}:`, error.message);
                    // Still remove from tracking even if container cleanup fails
                    this.removeSession(sessionId);
                }
            });

            this.sessions.set(sessionId, session);
            
            // Track user sessions
            if (!this.userSessions.has(userId)) {
                this.userSessions.set(userId, new Set());
            }
            this.userSessions.get(userId).add(sessionId);
            
            console.log(`Session created for ${username}:`, session);

            return session;
        } catch (error) {
            console.error('Error creating session:', error);
            
            // Cleanup on error
            try {
                const container = docker.getContainer(containerName);
                await container.remove({ force: true });
            } catch (cleanupError) {
                // Ignore cleanup errors
            }

            throw new Error(`Failed to create session: ${error.message}`);
        }
    }

    /**
     * Destroy a specific session (only if it belongs to the user)
     */
    async destroySession(userId, sessionId) {
        const session = this.sessions.get(sessionId);
        
        if (!session) {
            console.log(`No session found with id ${sessionId}`);
            return false;
        }

        // Security check: ensure session belongs to user
        if (session.userId !== userId) {
            console.log(`Session ${sessionId} does not belong to user ${userId}`);
            return false;
        }

        console.log(`Destroying session ${sessionId} for user: ${session.username}`);

        try {
            // Kill xterm process
            if (session.xtermPid) {
                try {
                    process.kill(session.xtermPid, 'SIGTERM');
                    console.log(`Killed xterm process ${session.xtermPid}`);
                } catch (error) {
                    console.error(`Error killing xterm process:`, error.message);
                }
            }

            // Stop and remove container
            const container = docker.getContainer(session.containerId);
            await container.stop({ t: 5 });
            console.log(`Stopped container ${session.containerName}`);
            
            // Container will be auto-removed due to AutoRemove flag
        } catch (error) {
            console.error('Error destroying session:', error);
        }

        this.removeSession(sessionId);
        console.log(`Session ${sessionId} destroyed`);
        return true;
    }

    /**
     * Destroy all sessions for a user
     */
    async destroyUserSessions(userId) {
        const sessionIds = Array.from(this.userSessions.get(userId) || []);
        const results = await Promise.all(
            sessionIds.map(sessionId => this.destroySession(userId, sessionId))
        );
        return results.filter(r => r).length;
    }

    /**
     * Get all active sessions (admin only - returns all users' sessions)
     */
    async getAllSessions() {
        const sessions = [];
        
        for (const [sessionId, session] of this.sessions.entries()) {
            try {
                const container = docker.getContainer(session.containerId);
                const info = await container.inspect();
                
                sessions.push({
                    ...session,
                    status: info.State.Running ? 'running' : 'stopped',
                    uptime: info.State.StartedAt
                });
            } catch (error) {
                // Container doesn't exist anymore
                this.removeSession(sessionId);
            }
        }

        return sessions;
    }

    /**
     * Get system statistics
     */
    async getSystemStats() {
        const containers = await docker.listContainers({
            filters: { label: ['x11-session-manager=true'] }
        });

        return {
            activeSessions: this.sessions.size,
            runningContainers: containers.length,
            sessions: Array.from(this.sessions.values()).map(s => ({
                userId: s.userId,
                username: s.username,
                port: s.port,
                createdAt: s.createdAt
            }))
        };
    }

    /**
     * Destroy all active sessions (cleanup on shutdown)
     */
    async destroyAllSessions() {
        console.log(`Cleaning up ${this.sessions.size} active sessions...`);
        
        // First, kill all xterm processes
        const sessionIds = Array.from(this.sessions.keys());
        for (const sessionId of sessionIds) {
            const session = this.sessions.get(sessionId);
            if (session && session.xtermPid) {
                try {
                    process.kill(session.xtermPid, 'SIGTERM');
                    console.log(`Killed xterm process ${session.xtermPid} for session ${sessionId}`);
                } catch (error) {
                    // Process may already be dead, which is fine
                    if (error.code !== 'ESRCH') {
                        console.error(`Error killing xterm process ${session.xtermPid}:`, error.message);
                    }
                }
            }
        }

        // Now destroy all tracked sessions
        const cleanupPromises = sessionIds.map(sessionId => {
            const session = this.sessions.get(sessionId);
            return this.destroySession(session.userId, sessionId).catch(error => {
                console.error(`Error cleaning up session ${sessionId}:`, error.message);
            });
        });

        await Promise.all(cleanupPromises);
        
        // Final sweep: force remove ALL containers with our label (catches any orphaned or stuck containers)
        console.log('Performing final sweep for any remaining containers...');
        try {
            const allContainers = await docker.listContainers({
                all: true,  // Include stopped containers
                filters: { label: ['x11-session-manager=true'] }
            });

            if (allContainers.length > 0) {
                console.log(`Found ${allContainers.length} container(s) to force remove`);
                
                const forceRemovePromises = allContainers.map(async (containerInfo) => {
                    try {
                        const container = docker.getContainer(containerInfo.Id);
                        const containerName = containerInfo.Names[0] || containerInfo.Id;
                        
                        // Force stop if running
                        if (containerInfo.State === 'running') {
                            console.log(`Force stopping running container: ${containerName}`);
                            await container.stop({ t: 2 });
                        }
                        
                        // Force remove
                        await container.remove({ force: true });
                        console.log(`Force removed container: ${containerName}`);
                    } catch (error) {
                        // Log but don't fail - best effort cleanup
                        console.error(`Error force removing container ${containerInfo.Id}:`, error.message);
                    }
                });

                await Promise.all(forceRemovePromises);
            } else {
                console.log('No containers found in final sweep');
            }
        } catch (error) {
            console.error('Error in final container sweep:', error.message);
        }

        // Clear all tracking maps
        this.sessions.clear();
        this.userSessions.clear();
        
        console.log('Session cleanup complete - all sessions destroyed and containers removed');
    }

    /**
     * Cleanup session after xterm exit (called by exit handler)
     */
    async cleanupAfterXtermExit(sessionId, sessionData, xtermPid, code, signal) {
        console.log(`xterm process ${xtermPid} exited (code: ${code}, signal: ${signal})`);
        console.log(`Auto-cleanup: destroying session ${sessionId} for user ${sessionData.username}`);
        
        try {
            // Stop and remove container
            const container = docker.getContainer(sessionData.containerId);
            await container.stop({ t: 5 });
            console.log(`Stopped container ${sessionData.containerName}`);
            
            // Remove from tracking
            this.removeSession(sessionId);
            console.log(`Session ${sessionId} cleaned up after xterm exit`);
        } catch (error) {
            console.error(`Error during auto-cleanup of session ${sessionId}:`, error.message);
            // Still remove from tracking even if container cleanup fails
            this.removeSession(sessionId);
        }
    }
}

module.exports = SessionManager;
