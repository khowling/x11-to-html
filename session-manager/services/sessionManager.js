const Docker = require('dockerode');
const { spawn } = require('child_process');

const docker = new Docker();

class SessionManager {
    constructor() {
        // In-memory store for sessions (in production, use Redis or database)
        this.sessions = new Map();
        this.basePort = parseInt(process.env.X11_BRIDGE_BASE_PORT) || 6080;
        this.bridgeImage = process.env.X11_BRIDGE_IMAGE || 'x11-web-bridge';
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
     * Get user's existing session
     */
    async getUserSession(userId) {
        const session = this.sessions.get(userId);
        
        if (!session) {
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
                this.sessions.delete(userId);
                return null;
            }
        } catch (error) {
            // Container doesn't exist, clean up
            this.sessions.delete(userId);
            return null;
        }
    }

    /**
     * Create a new session for a user
     */
    async createSession(userId, username) {
        console.log(`Creating session for user: ${username} (${userId})`);

        // Get available port
        const port = await this.getNextAvailablePort();
        const displayNum = port - this.basePort;
        const containerName = `x11-bridge-${userId.replace(/[^a-zA-Z0-9]/g, '-')}`;

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
            
            const x11Port = 6000 + displayNum + 1; // X11 display :1 = port 6001
            
            const container = await docker.createContainer({
                Image: this.bridgeImage,
                name: containerName,
                Env: [
                    `DISPLAY=:1`,
                    `VNC_PORT=${5900 + displayNum}`,
                    `NOVNC_PORT=${port}`,
                    `USER_ID=${userId}`,
                    `USERNAME=${username}`
                ],
                ExposedPorts: {
                    [`${port}/tcp`]: {},
                    '6001/tcp': {}  // Expose X11 port for display :1
                },
                HostConfig: {
                    PortBindings: {
                        [`${port}/tcp`]: [{ HostPort: `${port}` }],
                        '6001/tcp': [{ HostPort: `${x11Port}` }]
                    },
                    AutoRemove: true,
                    ShmSize: 268435456 // 256MB shared memory
                },
                Labels: {
                    'x11-session-manager': 'true',
                    'user-id': userId,
                    'username': username
                }
            });

            await container.start();
            console.log(`Container ${containerName} started`);

            // Wait for container to be ready (VNC server needs time to start)
            console.log('Waiting for VNC server to start...');
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Fork xterm process on host, connecting to container's X11 display
            // The container's VNC server is running on DISPLAY :1 and is accessible via TCP
            console.log(`Starting xterm process for display localhost:${x11Port}`);
            const xtermProcess = spawn('xterm', [
                '-display', `localhost:${displayNum + 1}`,  // Display :1 for first container
                '-fa', 'Monospace',
                '-fs', '12',
                '-title', `${username}'s Session`
            ], {
                detached: true,
                stdio: 'ignore'
            });

            xtermProcess.unref();

            const session = {
                userId,
                username,
                containerId: container.id,
                containerName,
                port,
                displayNum,
                xtermPid: xtermProcess.pid,
                url: `http://${process.env.HOST || 'localhost'}:${port}/vnc.html`,
                createdAt: new Date()
            };

            this.sessions.set(userId, session);
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
     * Destroy a user's session
     */
    async destroySession(userId) {
        const session = this.sessions.get(userId);
        
        if (!session) {
            console.log(`No session found for user ${userId}`);
            return;
        }

        console.log(`Destroying session for user: ${session.username}`);

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

        this.sessions.delete(userId);
        console.log(`Session destroyed for user ${userId}`);
    }

    /**
     * Get all active sessions
     */
    async getAllSessions() {
        const sessions = [];
        
        for (const [userId, session] of this.sessions.entries()) {
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
                this.sessions.delete(userId);
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
        
        const userIds = Array.from(this.sessions.keys());
        const cleanupPromises = userIds.map(userId => 
            this.destroySession(userId).catch(error => {
                console.error(`Error cleaning up session for ${userId}:`, error.message);
            })
        );

        await Promise.all(cleanupPromises);
        
        // Also clean up any orphaned containers
        try {
            const containers = await docker.listContainers({
                all: true,
                filters: { label: ['x11-session-manager=true'] }
            });

            const removePromises = containers.map(async (containerInfo) => {
                try {
                    const container = docker.getContainer(containerInfo.Id);
                    await container.stop({ t: 5 });
                    await container.remove();
                    console.log(`Removed orphaned container: ${containerInfo.Names[0]}`);
                } catch (error) {
                    console.error(`Error removing container ${containerInfo.Id}:`, error.message);
                }
            });

            await Promise.all(removePromises);
        } catch (error) {
            console.error('Error cleaning up orphaned containers:', error.message);
        }

        console.log('Session cleanup complete');
    }
}

module.exports = SessionManager;
