/**
 * WebRTCLens - Fastify REST API Tests
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server/app.js';
import { SDP_SAMPLES } from '../src/sdp/samples.js';
import { startMockStunTurnServer, type MockServerInstance } from './helpers/mock_stun_server.js';
import type { FastifyInstance } from 'fastify';

describe('Fastify REST API', () => {
  let app: FastifyInstance;
  let mockServer: MockServerInstance;

  before(async () => {
    mockServer = await startMockStunTurnServer();
    app = await buildServer({ enableStatic: false });
    await app.ready();
  });

  after(async () => {
    await app.close();
    await mockServer.close();
  });

  test('GET /api/health returns ok status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'WebRTCLens');
  });

  test('GET /api/sdp/samples returns catalog', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/sdp/samples',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(Array.isArray(body));
    assert.ok(body.length >= 4);
  });

  test('POST /api/sdp/diff returns structured comparison', async () => {
    const sample = SDP_SAMPLES[0];
    const res = await app.inject({
      method: 'POST',
      url: '/api/sdp/diff',
      payload: {
        offer: sample.offer,
        answer: sample.answer,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.diff.summary.negotiable, true);
    assert.equal(body.diff.summary.audioNegotiated, true);
    assert.equal(body.diff.summary.videoNegotiated, true);
  });

  test('POST /api/probe/stun executes STUN probe against mock server', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/probe/stun',
      payload: {
        host: mockServer.host,
        port: mockServer.port,
        transport: 'udp',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.mappedAddress.address, '127.0.0.1');
  });

  test('POST /api/probe/turn executes TURN allocation probe', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/probe/turn',
      payload: {
        host: mockServer.host,
        port: mockServer.port,
        transport: 'udp',
        username: 'testuser',
        credential: 'secret123',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.relayedAddress.address, '198.51.100.55');
  });

  test('POST /api/ice/analyze returns pair matrix and diagnostics', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ice/analyze',
      payload: {
        localCandidates: [
          'candidate:1 1 udp 2113937151 192.168.1.10 50000 typ host',
          'candidate:2 1 udp 1677729535 203.0.113.1 50000 typ srflx',
        ],
        remoteCandidates: [
          'candidate:3 1 udp 2113937151 192.168.1.20 50000 typ host',
        ],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.matrix);
    assert.ok(body.topology);
    assert.ok(body.diagnostics);
    assert.equal(body.matrix.pairs.length, 2);
  });
});
