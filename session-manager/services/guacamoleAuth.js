const crypto = require('crypto');

class GuacamoleAuth {
    constructor(options = {}) {
        this.secret = options.secret || process.env.GUACAMOLE_JSON_SECRET;
        this.publicUrl = options.publicUrl || process.env.GUACAMOLE_PUBLIC_URL || 'http://localhost:8080/';
        this.tokenTtlMs = options.tokenTtlMs
            || (parseInt(process.env.GUACAMOLE_TOKEN_TTL_SECONDS, 10) || 300) * 1000;

        if (!this.secret || !/^[0-9a-fA-F]{32}$/.test(this.secret)) {
            throw new Error('GUACAMOLE_JSON_SECRET must be a 32-character hexadecimal value');
        }
    }

    createSessionUrl(session) {
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

        const data = this.encryptPayload(payload);
        const url = new URL(this.publicUrl);
        url.searchParams.set('data', data);
        const clientId = Buffer.from(`${connectionName}\0c\0json`, 'utf8')
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        url.hash = `#/client/${clientId}`;
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
