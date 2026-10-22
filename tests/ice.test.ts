/**
 * WebRTCLens - ICE Candidate, Pair Matrix, and Diagnostics Tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCandidate,
  computeCandidatePriority,
  formatCandidate,
} from '../src/ice/candidate.js';
import {
  computePairPriority,
  buildPairMatrix,
} from '../src/ice/pair_matrix.js';
import { IceGatheringSession } from '../src/ice/gathering.js';
import { diagnoseIceConnectivity } from '../src/ice/diagnostics.js';

describe('ICE Candidate Parser and Serializer', () => {
  test('parses host candidate line', () => {
    const raw = 'candidate:4234997325 1 udp 2113937151 192.168.1.100 50000 typ host generation 0';
    const c = parseCandidate(raw);

    assert.equal(c.foundation, '4234997325');
    assert.equal(c.component, 1);
    assert.equal(c.transport, 'udp');
    assert.equal(c.priority, 2113937151);
    assert.equal(c.ip, '192.168.1.100');
    assert.equal(c.port, 50000);
    assert.equal(c.type, 'host');
    assert.equal(c.generation, '0');
  });

  test('parses srflx candidate with raddr and rport', () => {
    const raw = 'candidate:842163301 1 udp 1677729535 203.0.113.50 51234 typ srflx raddr 192.168.1.100 rport 50000';
    const c = parseCandidate(raw);

    assert.equal(c.type, 'srflx');
    assert.equal(c.ip, '203.0.113.50');
    assert.equal(c.raddr, '192.168.1.100');
    assert.equal(c.rport, 50000);
  });

  test('computes RFC 5245 candidate priority according to type preference', () => {
    const hostPri = computeCandidatePriority('host');
    const srflxPri = computeCandidatePriority('srflx');
    const relayPri = computeCandidatePriority('relay');

    assert.ok(hostPri > srflxPri);
    assert.ok(srflxPri > relayPri);
  });
});

describe('ICE Pair Priority Matrix', () => {
  test('computes RFC 5245 64-bit pair priority accurately', () => {
    const p1 = 2113937151; // host
    const p2 = 1677729535; // srflx

    const priority = computePairPriority(p1, p2);
    // Priority = 2^32 * MIN(p1, p2) + 2 * MAX(p1, p2) + (p1 > p2 ? 1 : 0)
    const expected = (4294967296n * BigInt(p2)) + (2n * BigInt(p1)) + 1n;
    assert.equal(priority, expected);
  });

  test('ranks host-host pair above relay pair', () => {
    const localHost = parseCandidate('candidate:1 1 udp 2113937151 192.168.1.10 50000 typ host');
    const localRelay = parseCandidate('candidate:2 1 udp 16777215 198.51.100.1 60000 typ relay');
    const remoteHost = parseCandidate('candidate:3 1 udp 2113937151 192.168.1.20 50000 typ host');

    const matrix = buildPairMatrix([localHost, localRelay], [remoteHost]);
    assert.equal(matrix.pairs.length, 2);
    assert.equal(matrix.topPriorityPair?.local.type, 'host');
    assert.equal(matrix.topPriorityPair?.remote.type, 'host');
    assert.equal(matrix.nominatedPair?.local.type, 'host');
  });
});

describe('ICE Gathering Waterfall', () => {
  test('tracks gathering lifecycle and aggregates metrics', () => {
    const session = new IceGatheringSession('test-session');
    session.start();

    const c1 = parseCandidate('candidate:1 1 udp 2113937151 192.168.1.10 50000 typ host');
    const c2 = parseCandidate('candidate:2 1 udp 1677729535 203.0.113.1 50000 typ srflx');
    session.addCandidate(c1, 10);
    session.addCandidate(c2, 45);
    session.complete();

    const report = session.getReport();
    assert.equal(report.state, 'complete');
    assert.equal(report.candidates.length, 2);
    assert.equal(report.countsByType.host, 1);
    assert.equal(report.countsByType.srflx, 1);
    assert.equal(report.waterfall.length, 2);
  });
});

describe('ICE Diagnostics Engine', () => {
  test('warns when only host candidates are gathered without STUN/TURN', () => {
    const localHost = parseCandidate('candidate:1 1 udp 2113937151 192.168.1.10 50000 typ host');
    const remoteHost = parseCandidate('candidate:2 1 udp 2113937151 192.168.1.20 50000 typ host');

    const report = diagnoseIceConnectivity([localHost], [remoteHost], []);
    assert.equal(report.status, 'degraded');
    assert.ok(report.issues.some((i) => i.id === 'host_only'));
    assert.ok(report.issues.some((i) => i.id === 'no_turn_server'));
  });

  test('reports critical issue when mDNS is isolated without reflexive fallback', () => {
    const localMdns = parseCandidate('candidate:1 1 udp 2113937151 12345678.local 50000 typ host');
    const remoteHost = parseCandidate('candidate:2 1 udp 2113937151 192.168.1.20 50000 typ host');

    const report = diagnoseIceConnectivity([localMdns], [remoteHost], []);
    assert.equal(report.status, 'critical');
    assert.ok(report.issues.some((i) => i.id === 'mdns_isolated'));
  });
});
