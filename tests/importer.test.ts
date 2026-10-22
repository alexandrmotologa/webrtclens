/**
 * WebRTCLens - webrtc-internals Log Importer Tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { importWebRtcDump } from '../src/sdp/importer.js';
import { SDP_SAMPLES } from '../src/sdp/samples.js';

describe('WebRTC Internals Importer', () => {
  const sample = SDP_SAMPLES[0];

  test('extracts offer and answer from mock chrome://webrtc-internals JSON export', () => {
    const mockChromeDump = JSON.stringify({
      PeerConnections: {
        '1001-1': {
          updateLog: [
            { type: 'setLocalDescription', value: sample.offer },
            { type: 'setRemoteDescription', value: sample.answer },
            { type: 'onicecandidate', value: 'candidate:1 1 udp 2113937151 192.168.1.10 50000 typ host' },
          ],
        },
      },
    });

    const res = importWebRtcDump(mockChromeDump);
    assert.equal(res.success, true);
    assert.equal(res.extractedFrom, 'chrome_internals_json');
    assert.ok(res.offer?.startsWith('v=0'));
    assert.ok(res.answer?.startsWith('v=0'));
    assert.equal(res.localCandidates.length, 1);
  });

  test('extracts SDP from raw combined text dump', () => {
    const rawText = `${sample.offer}\n\n${sample.answer}`;
    const res = importWebRtcDump(rawText);

    assert.equal(res.success, true);
    assert.ok(res.offer);
    assert.ok(res.answer);
  });
});
