/**
 * WebRTCLens - SDP Parser and Diff Engine Tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseSdp } from '../src/sdp/parser.js';
import { diffSdp } from '../src/sdp/diff.js';
import { SDP_SAMPLES } from '../src/sdp/samples.js';

describe('SDP Parser', () => {
  test('parses standard P2P offer correctly', () => {
    const sample = SDP_SAMPLES.find((s) => s.id === 'standard-p2p')!;
    const ast = parseSdp(sample.offer);

    assert.equal(ast.version, 0);
    assert.equal(ast.origin.username, '-');
    assert.equal(ast.bundleGroups.length, 1);
    assert.deepEqual(ast.bundleGroups[0].mids, ['0', '1']);

    assert.equal(ast.media.length, 2);
    const audio = ast.media[0];
    assert.equal(audio.type, 'audio');
    assert.equal(audio.mid, '0');
    assert.equal(audio.dtlsRole, 'actpass');
    assert.equal(audio.direction, 'sendrecv');
    assert.ok(audio.codecs.some((c) => c.name.toLowerCase() === 'opus' && c.payloadType === 111));

    const video = ast.media[1];
    assert.equal(video.type, 'video');
    assert.equal(video.mid, '1');
    assert.ok(video.codecs.some((c) => c.name.toUpperCase() === 'VP8' && c.payloadType === 96));
  });

  test('throws on invalid empty string', () => {
    assert.throws(() => parseSdp(''), { message: /Invalid SDP input/ });
  });
});

describe('SDP Diff Engine', () => {
  test('successfully negotiates standard P2P call', () => {
    const sample = SDP_SAMPLES.find((s) => s.id === 'standard-p2p')!;
    const offerAst = parseSdp(sample.offer);
    const answerAst = parseSdp(sample.answer);

    const diff = diffSdp(offerAst, answerAst);

    assert.equal(diff.summary.negotiable, true);
    assert.equal(diff.summary.audioNegotiated, true);
    assert.equal(diff.summary.videoNegotiated, true);
    assert.equal(diff.summary.bundleConfigured, true);
    assert.equal(diff.summary.errorsCount, 0);

    const audioDiff = diff.mediaDiffs[0];
    assert.equal(audioDiff.status, 'negotiated');
    const opusMatch = audioDiff.codecs.find((c) => c.name.toLowerCase() === 'opus');
    assert.ok(opusMatch);
    assert.equal(opusMatch.status, 'agreed');
  });

  test('flags H.264 profile mismatch as warning', () => {
    const sample = SDP_SAMPLES.find((s) => s.id === 'h264-profile-mismatch')!;
    const offerAst = parseSdp(sample.offer);
    const answerAst = parseSdp(sample.answer);

    const diff = diffSdp(offerAst, answerAst);

    assert.ok(diff.summary.warningsCount > 0);
    const h264Warning = diff.mediaDiffs[0].diagnostics.find((d) => d.message.includes('profile-level-id'));
    assert.ok(h264Warning);
  });

  test('detects rejected media line (port 0) for SIP gateway', () => {
    const sample = SDP_SAMPLES.find((s) => s.id === 'sip-pstn-gateway')!;
    const offerAst = parseSdp(sample.offer);
    const answerAst = parseSdp(sample.answer);

    const diff = diffSdp(offerAst, answerAst);

    assert.equal(diff.summary.totalOfferMedia, 2);
    assert.equal(diff.summary.audioNegotiated, true);
    assert.equal(diff.summary.videoNegotiated, false);
    assert.equal(diff.summary.rejectedMediaCount, 1);

    const videoDiff = diff.mediaDiffs[1];
    assert.equal(videoDiff.status, 'rejected');
  });

  test('flags DTLS role collision as error', () => {
    const sample = SDP_SAMPLES.find((s) => s.id === 'dtls-role-conflict')!;
    const offerAst = parseSdp(sample.offer);
    const answerAst = parseSdp(sample.answer);

    const diff = diffSdp(offerAst, answerAst);

    assert.equal(diff.summary.dtlsCompatible, false);
    assert.equal(diff.summary.negotiable, false);
    assert.ok(diff.summary.errorsCount > 0);
  });
});
