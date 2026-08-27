const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const GuacamoleAuth = require('../services/guacamoleAuth');

const secret = '00112233445566778899aabbccddeeff';

function decryptData(data) {
    const key = Buffer.from(secret, 'hex');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final()
    ]);
    const signature = decrypted.subarray(0, 32);
    const json = decrypted.subarray(32);
    const expected = crypto.createHmac('sha256', key).update(json).digest();

    assert.equal(crypto.timingSafeEqual(signature, expected), true);
    return JSON.parse(json.toString('utf8'));
}

test('creates a signed, encrypted, expiring VNC connection', () => {
    const auth = new GuacamoleAuth({
        secret,
        publicUrl: 'http://localhost:8080/',
        tokenTtlMs: 60_000
    });
    const before = Date.now();
    const url = new URL(auth.createSessionUrl({
        username: 'user@example.com',
        sessionId: 'session-123',
        containerName: 'x11-bridge-session-123',
        vncPassword: 'testpass'
    }));
    const payload = decryptData(url.searchParams.get('data'));

    assert.equal(url.origin, 'http://localhost:8080');
    assert.match(url.hash, /^#\/client\//);
    assert.equal(payload.username, 'user@example.com');
    assert.ok(payload.expires >= before + 60_000);
    assert.deepEqual(payload.connections['X11 session-123'], {
        protocol: 'vnc',
        parameters: {
            hostname: 'x11-bridge-session-123',
            port: '5901',
            password: 'testpass',
            'color-depth': '24',
            'resize-method': 'display-update',
            'disable-audio': 'true'
        }
    });
});

test('rejects missing or malformed shared secrets', () => {
    assert.throws(
        () => new GuacamoleAuth({ secret: 'not-a-key' }),
        /32-character hexadecimal/
    );
});
