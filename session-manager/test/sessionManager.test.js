const assert = require('node:assert/strict');
const test = require('node:test');

process.env.GUACAMOLE_JSON_SECRET = '00112233445566778899aabbccddeeff';

const SessionManager = require('../services/sessionManager');

test('reserves unique ports for sessions being created concurrently', () => {
    const manager = new SessionManager();
    const first = manager.reserveNextAvailablePorts();
    const second = manager.reserveNextAvailablePorts();

    assert.deepEqual(first, { sshPort: 22000, x11Port: 6001 });
    assert.deepEqual(second, { sshPort: 22001, x11Port: 6002 });
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

test('client session excludes credentials and internal network details', () => {
    const manager = new SessionManager();
    const clientSession = manager.toClientSession({
        sessionId: 'session-123',
        userId: 'user-123',
        username: 'user@example.com',
        containerId: 'container-123',
        containerName: 'x11-bridge-session-123',
        displayNum: 1,
        width: 1280,
        height: 720,
        x11Port: 6001,
        sshPort: 22000,
        xtermPid: 1234,
        createdAt: new Date('2026-08-27T00:00:00Z'),
        sshCredentialsDirectory: '/tmp/private-key',
        hostNetworkName: 'x11-host-session-123',
        vncPassword: 'testpass'
    });

    assert.equal(clientSession.sshCredentialsDirectory, undefined);
    assert.equal(clientSession.hostNetworkName, undefined);
    assert.equal(clientSession.vncPassword, undefined);
    assert.match(clientSession.url, /^http:\/\/localhost:8080\/\?data=/);
});
