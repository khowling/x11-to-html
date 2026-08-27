const Docker = require('dockerode');
const crypto = require('crypto');
const GuacamoleAuth = require('./guacamoleAuth');

const docker = new Docker();

class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.userSessions = new Map();
        this.networkName = process.env.X11_DOCKER_NETWORK || 'x11-guacamole';
        this.applications = {
            xterm: {
                id: 'xterm',
                name: 'Terminal',
                image: process.env.X11_XTERM_IMAGE || 'x11-app-xterm'
            },
            xeyes: {
                id: 'xeyes',
                name: 'XEyes',
                image: process.env.X11_XEYES_IMAGE || 'x11-app-xeyes'
            }
        };
        this.guacamoleAuth = new GuacamoleAuth();
    }

    getApplications() {
        return Object.values(this.applications).map(application => ({
            id: application.id,
            name: application.name
        }));
    }

    generateSessionId() {
        return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateVncPassword() {
        return crypto.randomBytes(6).toString('base64url');
    }

    normalizeDisplaySize(displaySize = {}) {
        const width = Math.min(Math.max(parseInt(displaySize.width, 10) || 1024, 640), 3840);
        const height = Math.min(Math.max(parseInt(displaySize.height, 10) || 768, 480), 2160);

        return { width, height };
    }

    getApplication(applicationId = 'xterm') {
        if (!Object.hasOwn(this.applications, applicationId)) {
            throw new Error(`Unsupported application: ${applicationId}`);
        }
        return this.applications[applicationId];
    }

    async ensureApplicationImage(application) {
        try {
            await docker.getImage(application.image).inspect();
        } catch (error) {
            if (error.statusCode === 404) {
                throw new Error(
                    `Docker image ${application.image} is not available. Run ./build-images.sh from the repository root.`
                );
            }
            throw error;
        }
    }

    async ensureDockerNetwork() {
        try {
            const network = await docker.getNetwork(this.networkName).inspect();
            if (!network.Internal) {
                throw new Error(`Docker network ${this.networkName} must be internal`);
            }
        } catch (error) {
            if (error.statusCode !== 404) {
                throw error;
            }

            try {
                await docker.createNetwork({
                    Name: this.networkName,
                    Internal: true,
                    CheckDuplicate: true,
                    Labels: {
                        'x11-session-manager': 'true'
                    }
                });
            } catch (createError) {
                if (createError.statusCode !== 409) {
                    throw createError;
                }
            }
        }
    }

    getUserSessions(userId) {
        const sessionIds = this.userSessions.get(userId) || new Set();
        const userSessions = [];

        for (const sessionId of sessionIds) {
            const session = this.sessions.get(sessionId);
            if (session) {
                userSessions.push(this.toClientSession(session));
            }
        }

        return userSessions;
    }

    async getUserSession(userId, sessionId) {
        const session = this.sessions.get(sessionId);

        if (!session || session.userId !== userId) {
            return null;
        }

        try {
            const info = await docker.getContainer(session.containerId).inspect();
            if (info.State.Running) {
                return this.toClientSession(session);
            }

            await this.removeSession(sessionId);
            return null;
        } catch (error) {
            await this.removeSession(sessionId);
            return null;
        }
    }

    toClientSession(session) {
        return {
            sessionId: session.sessionId,
            userId: session.userId,
            username: session.username,
            applicationId: session.applicationId,
            applicationName: session.applicationName,
            image: session.image,
            containerId: session.containerId,
            containerName: session.containerName,
            displayNum: session.displayNum,
            width: session.width,
            height: session.height,
            createdAt: session.createdAt
        };
    }

    async createSessionLaunchUrl(userId, sessionId) {
        const clientSession = await this.getUserSession(userId, sessionId);
        if (!clientSession) {
            return null;
        }

        return this.guacamoleAuth.createLaunchUrl(this.sessions.get(sessionId));
    }

    async createAdminSessionLaunchUrl(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        const clientSession = await this.getUserSession(session.userId, sessionId);
        if (!clientSession) {
            return null;
        }

        return this.guacamoleAuth.createLaunchUrl(this.sessions.get(sessionId));
    }

    async removeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        const userSessionIds = this.userSessions.get(session.userId);
        if (userSessionIds) {
            userSessionIds.delete(sessionId);
            if (userSessionIds.size === 0) {
                this.userSessions.delete(session.userId);
            }
        }
        this.sessions.delete(sessionId);
    }

    monitorContainer(session, container) {
        container.wait()
            .then(async result => {
                const currentSession = this.sessions.get(session.sessionId);
                if (!currentSession || currentSession.destroying) {
                    return;
                }

                console.log(
                    `Application container ${session.containerName} exited with status ${result.StatusCode}`
                );
                await this.removeSession(session.sessionId);
            })
            .catch(error => {
                if (this.sessions.has(session.sessionId)) {
                    console.error(
                        `Error monitoring container ${session.containerName}:`,
                        error.message
                    );
                }
            });
    }

    async waitForApplication(container, applicationName) {
        const timeoutAt = Date.now() + 20_000;

        while (Date.now() < timeoutAt) {
            const info = await container.inspect();
            if (!info.State.Running) {
                throw new Error(`${applicationName} container stopped during startup`);
            }

            const check = await container.exec({
                Cmd: [
                    '/bin/sh',
                    '-c',
                    'test -S /tmp/.X11-unix/X1 && test -f /tmp/x11-application-ready'
                ],
                AttachStdout: false,
                AttachStderr: false
            });
            const stream = await check.start({ Detach: false, Tty: false });
            await new Promise((resolve, reject) => {
                stream.on('end', resolve);
                stream.on('error', reject);
                stream.resume();
            });
            const result = await check.inspect();

            if (result.ExitCode === 0) {
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 250));
        }

        throw new Error(`${applicationName} did not become ready within 20 seconds`);
    }

    async createSession(userId, username, displaySize, applicationId = 'xterm') {
        return this.createSessionInternal(
            userId,
            username,
            displaySize,
            applicationId,
            () => {}
        );
    }

    async createSessionWithProgress(
        userId,
        username,
        displaySize,
        applicationId,
        progressCallback
    ) {
        if (typeof applicationId === 'function') {
            progressCallback = applicationId;
            applicationId = 'xterm';
        }

        return this.createSessionInternal(
            userId,
            username,
            displaySize,
            applicationId,
            progressCallback
        );
    }

    async createSessionInternal(
        userId,
        username,
        displaySize,
        applicationId,
        progressCallback
    ) {
        const application = this.getApplication(applicationId);
        const sessionId = this.generateSessionId();
        const { width, height } = this.normalizeDisplaySize(displaySize);
        const containerName = `x11-${application.id}-${sessionId}`;
        const vncPassword = this.generateVncPassword();
        let container;

        console.log(
            `Creating ${application.name} session ${sessionId} for user: ${username} (${userId})`
        );

        try {
            await this.ensureApplicationImage(application);
            await this.ensureDockerNetwork();
            progressCallback(
                'container',
                `Creating ${application.name} container on the private Guacamole network...`
            );

            container = await docker.createContainer({
                Image: application.image,
                name: containerName,
                Env: [
                    'DISPLAY=:1',
                    `VNC_RESOLUTION=${width}x${height}`,
                    'VNC_PORT=5901',
                    `VNC_PASSWORD=${vncPassword}`,
                    `USER_ID=${userId}`,
                    `USERNAME=${username}`,
                    `SESSION_ID=${sessionId}`
                ],
                HostConfig: {
                    AutoRemove: true,
                    ShmSize: 268435456
                },
                NetworkingConfig: {
                    EndpointsConfig: {
                        [this.networkName]: {
                            Aliases: [containerName]
                        }
                    }
                },
                Labels: {
                    'x11-session-manager': 'true',
                    'x11-application': application.id,
                    'user-id': userId,
                    'username': username,
                    'session-id': sessionId
                }
            });

            progressCallback('starting', `Starting ${application.name} container...`);
            await container.start();

            progressCallback('vnc', 'Waiting for the private VNC display to initialize...');
            await this.waitForApplication(container, application.name);

            progressCallback('application', `${application.name} is ready...`);
            const session = {
                sessionId,
                userId,
                username,
                applicationId: application.id,
                applicationName: application.name,
                image: application.image,
                containerId: container.id,
                containerName,
                displayNum: 1,
                width,
                height,
                vncPassword,
                createdAt: new Date()
            };

            this.sessions.set(sessionId, session);
            if (!this.userSessions.has(userId)) {
                this.userSessions.set(userId, new Set());
            }
            this.userSessions.get(userId).add(sessionId);
            this.monitorContainer(session, container);

            progressCallback('guacamole', 'Creating secure Guacamole connection...');
            console.log(`${application.name} session ${sessionId} created for ${username}`);
            return this.toClientSession(session);
        } catch (error) {
            console.error('Error creating session:', error);

            if (container) {
                try {
                    await container.remove({ force: true });
                } catch (cleanupError) {
                    if (cleanupError.statusCode !== 404) {
                        console.error(
                            `Error removing failed container ${containerName}:`,
                            cleanupError.message
                        );
                    }
                }
            }

            throw new Error(`Failed to create session: ${error.message}`);
        }
    }

    async destroySession(userId, sessionId) {
        const session = this.sessions.get(sessionId);

        if (!session) {
            console.log(`No session found with id ${sessionId}`);
            return false;
        }

        if (session.userId !== userId) {
            console.log(`Session ${sessionId} does not belong to user ${userId}`);
            return false;
        }

        console.log(`Destroying session ${sessionId} for user: ${session.username}`);
        session.destroying = true;

        try {
            await docker.getContainer(session.containerId).stop({ t: 5 });
            console.log(`Stopped container ${session.containerName}`);
        } catch (error) {
            if (error.statusCode !== 304 && error.statusCode !== 404) {
                console.error('Error destroying session:', error);
            }
        }

        await this.removeSession(sessionId);
        console.log(`Session ${sessionId} destroyed`);
        return true;
    }

    async destroyUserSessions(userId) {
        const sessionIds = Array.from(this.userSessions.get(userId) || []);
        const results = await Promise.all(
            sessionIds.map(sessionId => this.destroySession(userId, sessionId))
        );
        return results.filter(Boolean).length;
    }

    async getAllSessions() {
        const sessions = [];

        for (const [sessionId, session] of this.sessions.entries()) {
            try {
                const info = await docker.getContainer(session.containerId).inspect();
                sessions.push({
                    ...this.toClientSession(session),
                    status: info.State.Running ? 'running' : 'stopped',
                    uptime: info.State.StartedAt
                });
            } catch (error) {
                await this.removeSession(sessionId);
            }
        }

        return sessions;
    }

    async getSystemStats() {
        const containers = await docker.listContainers({
            filters: { label: ['x11-session-manager=true'] }
        });

        return {
            activeSessions: this.sessions.size,
            runningContainers: containers.length,
            sessions: Array.from(this.sessions.values()).map(session => ({
                userId: session.userId,
                username: session.username,
                applicationId: session.applicationId,
                createdAt: session.createdAt
            }))
        };
    }

    async destroyAllSessions() {
        console.log(`Cleaning up ${this.sessions.size} active sessions...`);
        const sessions = Array.from(this.sessions.values());

        await Promise.all(
            sessions.map(session => this.destroySession(session.userId, session.sessionId)
                .catch(error => {
                    console.error(
                        `Error cleaning up session ${session.sessionId}:`,
                        error.message
                    );
                }))
        );

        console.log('Performing final sweep for any remaining containers...');
        try {
            const containers = await docker.listContainers({
                all: true,
                filters: { label: ['x11-session-manager=true'] }
            });

            await Promise.all(containers.map(async containerInfo => {
                try {
                    await docker.getContainer(containerInfo.Id).remove({ force: true });
                    console.log(`Force removed container ${containerInfo.Id}`);
                } catch (error) {
                    if (error.statusCode !== 404) {
                        console.error(
                            `Error force removing container ${containerInfo.Id}:`,
                            error.message
                        );
                    }
                }
            }));
        } catch (error) {
            console.error('Error in final container sweep:', error.message);
        }

        this.sessions.clear();
        this.userSessions.clear();
        console.log('Session cleanup complete - all sessions destroyed and containers removed');
    }
}

module.exports = SessionManager;
