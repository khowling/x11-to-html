const assert = require('node:assert/strict');
const test = require('node:test');

process.env.GUACAMOLE_JSON_SECRET = '00112233445566778899aabbccddeeff';
delete process.env.X11_XTERM_IMAGE;
delete process.env.X11_XEYES_IMAGE;

const SessionManager = require('../services/sessionManager');

test('allows only configured application images', () => {
    const manager = new SessionManager();

    assert.deepEqual(manager.getApplication('xterm'), {
        id: 'xterm',
        name: 'Terminal',
        image: 'x11-app-xterm'
    });
    assert.deepEqual(manager.getApplication('xeyes'), {
        id: 'xeyes',
        name: 'XEyes',
        image: 'x11-app-xeyes'
    });
    assert.throws(() => manager.getApplication('custom-command'), /Unsupported application/);
    assert.throws(() => manager.getApplication('toString'), /Unsupported application/);
    assert.deepEqual(manager.getApplications(), [
        { id: 'xterm', name: 'Terminal' },
        { id: 'xeyes', name: 'XEyes' }
    ]);
});

test('normalizes requested browser dimensions to safe display limits', () => {
    const manager = new SessionManager();

    assert.deepEqual(manager.normalizeDisplaySize({ width: '1280', height: '720' }), {
        width: 1280,
        height: 720
    });
    assert.deepEqual(manager.normalizeDisplaySize({ width: '10', height: '99999' }), {
        width: 640,
        height: 2160
    });
    assert.deepEqual(manager.normalizeDisplaySize({}), {
        width: 1024,
        height: 768
    });
});

test('generates an eight-character VNC password with 48 bits of randomness', () => {
    const manager = new SessionManager();

    assert.match(manager.generateVncPassword(), /^[A-Za-z0-9_-]{8}$/);
});

test('client session excludes credentials and internal network details', () => {
    const manager = new SessionManager();
    const clientSession = manager.toClientSession({
        sessionId: 'session-123',
        userId: 'user-123',
        username: 'user@example.com',
        applicationId: 'xeyes',
        applicationName: 'XEyes',
        image: 'x11-app-xeyes',
        containerId: 'container-123',
        containerName: 'x11-xeyes-session-123',
        displayNum: 1,
        width: 1280,
        height: 720,
        createdAt: new Date('2026-08-27T00:00:00Z'),
        vncPassword: 'testpass'
    });

    assert.equal(clientSession.vncPassword, undefined);
    assert.equal(clientSession.applicationId, 'xeyes');
    assert.equal(clientSession.image, 'x11-app-xeyes');
    assert.equal(clientSession.url, undefined);
});
