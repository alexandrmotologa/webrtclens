/**
 * WebRTCLens - TURN Protocol Allocation and Authentication Tests
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { probeTurn, computeTurnKey, parseTurnUrl } from '../src/stun_turn/turn_client.js';
import { startMockStunTurnServer, type MockServerInstance } from './helpers/mock_stun_server.js';

describe('TURN URL Parser', () => {
  test('parses turn: and turns: URLs', () => {
    const u1 = parseTurnUrl('turn:relay.example.com:3478');
    assert.equal(u1.host, 'relay.example.com');
    assert.equal(u1.port, 3478);
    assert.equal(u1.transport, 'udp');

    const u2 = parseTurnUrl('turns:relay.example.com:5349?transport=tcp');
    assert.equal(u2.host, 'relay.example.com');
    assert.equal(u2.port, 5349);
    assert.equal(u2.transport, 'tcp');
  });

  test('computes RFC 8656 MD5 HA1 key accurately', () => {
    const key = computeTurnKey('testuser', 'example.org', 'secret123');
    assert.equal(key.length, 16);
  });
});

describe('TURN Allocation Client with Mock Server', () => {
  let server: MockServerInstance;

  before(async () => {
    server = await startMockStunTurnServer();
  });

  after(async () => {
    await server.close();
  });

  test('fails allocation cleanly when credentials are not supplied after 401 challenge', async () => {
    const res = await probeTurn({
      host: server.host,
      port: server.port,
      transport: 'udp',
      timeoutMs: 1500,
    });

    assert.equal(res.success, false);
    assert.equal(res.stageReached, 'unauthorized_probe');
    assert.equal(res.realm, 'webrtclens.org');
    assert.match(res.error || '', /401 challenge/);
  });

  test('successfully allocates relayed address with valid credentials', async () => {
    const res = await probeTurn({
      host: server.host,
      port: server.port,
      transport: 'udp',
      credentials: {
        username: 'testuser',
        credential: 'secret123',
      },
      timeoutMs: 2000,
    });

    assert.equal(res.success, true);
    assert.equal(res.stageReached, 'authenticated_allocation');
    assert.ok(res.relayedAddress);
    assert.equal(res.relayedAddress.address, '198.51.100.55');
    assert.equal(res.relayedAddress.port, 50012);
    assert.ok(res.mappedAddress);
    assert.equal(res.lifetime, 600);
    assert.ok(res.rttMs > 0);
  });

  test('rejects allocation when given wrong credentials', async () => {
    const res = await probeTurn({
      host: server.host,
      port: server.port,
      transport: 'udp',
      credentials: {
        username: 'wronguser',
        credential: 'wrongpassword',
      },
      timeoutMs: 2000,
    });

    assert.equal(res.success, false);
    assert.match(res.error || '', /403/);
  });
});
