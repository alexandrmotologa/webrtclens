/**
 * WebRTCLens - SDP Munger and Codec Stripper Tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { stripCodecsFromSdp, preferCodecInSdp, mungeSdp } from '../src/sdp/munger.js';
import { SDP_SAMPLES } from '../src/sdp/samples.js';
import { parseSdp } from '../src/sdp/parser.js';

describe('SDP Munger & Codec Stripper', () => {
  const sample = SDP_SAMPLES.find((s) => s.id === 'standard-p2p')!;

  test('strips specific video codec (VP8) and its payload type from m= line', () => {
    const modified = stripCodecsFromSdp(sample.offer, ['VP8']);
    const ast = parseSdp(modified);

    const video = ast.media.find((m) => m.type === 'video')!;
    assert.equal(video.codecs.some((c) => c.name.toUpperCase() === 'VP8'), false);
    // Other codecs (VP9, H264) must remain
    assert.equal(video.codecs.some((c) => c.name.toUpperCase() === 'VP9'), true);
    assert.equal(video.codecs.some((c) => c.name.toUpperCase() === 'H264'), true);
  });

  test('prefers codec by moving its payload type to first position', () => {
    const modified = preferCodecInSdp(sample.offer, 'video', 'H264');
    const ast = parseSdp(modified);

    const video = ast.media.find((m) => m.type === 'video')!;
    assert.equal(video.codecs[0].name.toUpperCase(), 'H264');
  });

  test('mungeSdp updates DTLS role, BUNDLE, and Opus parameters simultaneously', () => {
    const modified = mungeSdp(sample.offer, {
      dtlsRole: 'active',
      enableBundle: false,
      bitrateCapKbps: 1500,
      opusStereo: true,
      opusInbandFec: true,
      opusMinPtime: 20,
    });

    const ast = parseSdp(modified);
    assert.equal(ast.media[0].dtlsRole, 'active');
    assert.equal(ast.bundleGroups.length, 0); // BUNDLE removed
    assert.equal(ast.media[0].bandwidth?.limit, 1500);

    const audio = ast.media.find((m) => m.type === 'audio')!;
    const opus = audio.codecs.find((c) => c.name.toLowerCase() === 'opus')!;
    assert.equal(opus.parameters?.['stereo'], '1');
    assert.equal(opus.parameters?.['minptime'], '20');
  });
});
