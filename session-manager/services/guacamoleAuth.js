const crypto = require('crypto');

class GuacamoleAuth {
    constructor(options = {}) {
        this.secret = options.secret || process.env.GUACAMOLE_JSON_SECRET;
        this.publicUrl = options.publicUrl || process.env.GUACAMOLE_PUBLIC_URL || 'http://localhost:8080/';
        this.apiUrl = options.apiUrl || process.env.GUACAMOLE_API_URL || this.publicUrl;
        this.fetch = options.fetch || global.fetch;
        this.tokenTtlMs = options.tokenTtlMs
            || (parseInt(process.env.GUACAMOLE_TOKEN_TTL_SECONDS, 10) || 300) * 1000;

        if (!this.secret || !/^[0-9a-fA-F]{32}$/.test(this.secret)) {
            throw new Error('GUACAMOLE_JSON_SECRET must be a 32-character hexadecimal value');
        }

        if (typeof this.fetch !== 'function') {
            throw new Error('A Fetch API implementation is required for Guacamole authentication');
        }
    }

    createConnection(session) {
        const connectionName = `X11 ${session.sessionId}`;
        const payload = {
            username: session.username,
            expires: Date.now() + this.tokenTtlMs,
            connections: {
                [connectionName]: {
                    protocol: 'vnc',
                    parameters: {
                        hostname: session.containerName,
                        port: '5901',
                        password: session.vncPassword,
                        'color-depth': '24',
                        'resize-method': 'display-update',
                        'disable-audio': 'true'
                    }
                }
            }
        };

        return {
            data: this.encryptPayload(payload),
            clientId: Buffer.from(`${connectionName}\0c\0json`, 'utf8')
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '')
        };
    }

    createSessionUrl(session) {
        const connection = this.createConnection(session);
        const url = new URL(this.publicUrl);
        url.searchParams.set('data', connection.data);
        url.hash = `#/client/${connection.clientId}`;
        return url.toString();
    }

    async createLaunchUrl(session) {
        const connection = this.createConnection(session);
        const response = await this.fetch(new URL('api/tokens', this.apiUrl), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ data: connection.data }),
            signal: AbortSignal.timeout(10_000)
        });

        if (!response.ok) {
            const detail = await response.text();
            throw new Error(
                `Guacamole authentication failed (${response.status})${detail ? `: ${detail}` : ''}`
            );
        }

        const result = await response.json();
        if (!result.authToken || typeof result.authToken !== 'string') {
            throw new Error('Guacamole authentication response did not include an auth token');
        }

        const url = new URL(this.publicUrl);
        url.searchParams.set('token', result.authToken);
        url.hash = `#/client/${connection.clientId}`;
        return url.toString();
    }

    encryptPayload(payload) {
        const key = Buffer.from(this.secret, 'hex');
        const json = Buffer.from(JSON.stringify(payload), 'utf8');
        const signature = crypto.createHmac('sha256', key).update(json).digest();
        const cipher = crypto.createCipheriv('aes-128-cbc', key, Buffer.alloc(16));

        return Buffer.concat([
            cipher.update(Buffer.concat([signature, json])),
            cipher.final()
        ]).toString('base64');
    }
}

module.exports = GuacamoleAuth;
