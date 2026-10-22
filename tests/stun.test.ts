/**
 * WebRTCLens - STUN Protocol Encoding, Decoding, and Probe Tests
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  STUN_MESSAGE_TYPES,
  STUN_ATTRIBUTES,
  STUN_MAGIC_COOKIE,
} from '../src/stun_turn/protocol.js';
import {
  encodeStunMessage,
  createXorAddressAttribute,
  createStringAttribute,
} from '../src/stun_turn/encoder.js';
import { decodeStunMessage } from '../src/stun_turn/decoder.js';
import { probeStun, parseStunUrl } from '../src/stun_turn/stun_client.js';
import { runBenchmark } from '../src/stun_turn/benchmark.js';
import { startMockStunTurnServer, type MockServerInstance } from './helpers/mock_stun_server.js';

describe('STUN URL Parser', () => {
  test('parses stun: prefix correctly', () => {
    const res = parseStunUrl('stun:stun.l.google.com:19302');
    assert.equal(res.host, 'stun.l.google.com');
    assert.equal(res.port, 19302);
    assert.equal(res.transport, 'udp');
  });

  test('parses host without prefix and custom transport', () => {
    const res = parseStunUrl('relay.coturn.net:3478?transport=tcp');
    assert.equal(res.host, 'relay.coturn.net');
    assert.equal(res.port, 3478);
    assert.equal(res.transport, 'tcp');
  });
});

describe('STUN Binary Protocol Encoder & Decoder', () => {
  test('encodes and decodes STUN Binding Request packet', () => {
    const txId = randomBytes(12);
    const encoded = encodeStunMessage({
      type: STUN_MESSAGE_TYPES.BINDING_REQUEST,
      transactionId: txId,
      attributes: [
        createStringAttribute(STUN_ATTRIBUTES.SOFTWARE, 'WebRTCLens-Client'),
      ],
      addFingerprint: true,
    });

    assert.ok(encoded.length >= 20);
    const decoded = decodeStunMessage(encoded);

    assert.equal(decoded.header.type, STUN_MESSAGE_TYPES.BINDING_REQUEST);
    assert.equal(decoded.header.magicCookie, STUN_MAGIC_COOKIE);
    assert.deepEqual(decoded.header.transactionId, txId);
    assert.equal(decoded.software, 'WebRTCLens-Client');
    assert.equal(decoded.hasFingerprint, true);
  });

  test('encodes and decodes XOR-MAPPED-ADDRESS attribute', () => {
    const txId = randomBytes(12);
    const testIp = '203.0.113.195';
    const testPort = 54321;

    const encoded = encodeStunMessage({
      type: STUN_MESSAGE_TYPES.BINDING_RESPONSE,
      transactionId: txId,
      attributes: [
        createXorAddressAttribute(
          STUN_ATTRIBUTES.XOR_MAPPED_ADDRESS,
          testIp,
          testPort,
          txId
        ),
      ],
      addFingerprint: true,
    });

    const decoded = decodeStunMessage(encoded);
    assert.ok(decoded.xorMappedAddress);
    assert.equal(decoded.xorMappedAddress.family, 'IPv4');
    assert.equal(decoded.xorMappedAddress.address, testIp);
    assert.equal(decoded.xorMappedAddress.port, testPort);
  });
});

describe('STUN Probe Client with Mock Server', () => {
  let server: MockServerInstance;

  before(async () => {
    server = await startMockStunTurnServer();
  });

  after(async () => {
    await server.close();
  });

  test('successfully probes local mock STUN server', async () => {
    const res = await probeStun({
      host: server.host,
      port: server.port,
      transport: 'udp',
      timeoutMs: 1500,
    });

    assert.equal(res.success, true);
    assert.ok(res.rttMs >= 0);
    assert.ok(res.mappedAddress);
    assert.equal(res.mappedAddress.address, '127.0.0.1');
    assert.ok(res.mappedAddress.port > 0);
    assert.equal(res.software, 'WebRTCLens-Mock/1.0');
  });

  test('runs multi-probe benchmark and computes jitter', async () => {
    const benchmark = await runBenchmark({
      host: server.host,
      port: server.port,
      iterations: 3,
      intervalMs: 50,
      timeoutMs: 1500,
    });

    assert.equal(benchmark.sentProbes, 3);
    assert.equal(benchmark.successfulProbes, 3);
    assert.equal(benchmark.packetLossPercent, 0);
    assert.ok(benchmark.mappedIp);
    assert.equal(benchmark.natType, 'full_cone');
    assert.equal(benchmark.history.length, 3);
  });
});
