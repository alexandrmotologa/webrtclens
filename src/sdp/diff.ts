/**
 * WebRTCLens - SDP Offer vs Answer Semantic Diff Engine
 */

import type {
  SessionDescriptionAST,
  MediaSectionAST,
  SdpDiffResult,
  MediaDiffResult,
  CodecMatch,
  DiffSeverity,
  DtlsRole,
} from './types.js';

export function diffSdp(offer: SessionDescriptionAST, answer: SessionDescriptionAST): SdpDiffResult {
  const globalDiagnostics: Array<{ severity: DiffSeverity; message: string; rfcRef?: string }> = [];
  const mediaDiffs: MediaDiffResult[] = [];

  let matchedMediaCount = 0;
  let rejectedMediaCount = 0;
  let audioNegotiated = false;
  let videoNegotiated = false;
  let errorsCount = 0;
  let warningsCount = 0;

  // 1. Session Level Checks
  if (offer.version !== answer.version) {
    globalDiagnostics.push({
      severity: 'warning',
      message: `SDP protocol version mismatch: Offer v=${offer.version}, Answer v=${answer.version}`,
      rfcRef: 'RFC 8866 Section 5.1',
    });
    warningsCount++;
  }

  // BUNDLE Group Comparison
  const offerBundleMids = new Set<string>();
  for (const g of offer.bundleGroups) {
    if (g.semantics.toUpperCase() === 'BUNDLE') {
      g.mids.forEach((m) => offerBundleMids.add(m));
    }
  }

  const answerBundleMids = new Set<string>();
  for (const g of answer.bundleGroups) {
    if (g.semantics.toUpperCase() === 'BUNDLE') {
      g.mids.forEach((m) => answerBundleMids.add(m));
    }
  }

  if (offerBundleMids.size > 0 && answerBundleMids.size === 0) {
    globalDiagnostics.push({
      severity: 'warning',
      message: 'Offer requested BUNDLE multiplexing, but Answer did not return a=group:BUNDLE. Individual ports will be used per media line.',
      rfcRef: 'RFC 9143 Section 7.2',
    });
    warningsCount++;
  }

  // 2. Media Section Matching
  // Match media sections either by MID or by index position
  const maxSections = Math.max(offer.media.length, answer.media.length);

  for (let i = 0; i < maxSections; i++) {
    const offerMedia: MediaSectionAST | undefined = offer.media[i];
    const answerMedia: MediaSectionAST | undefined =
      offerMedia && offerMedia.mid
        ? answer.media.find((m) => m.mid === offerMedia.mid) || answer.media[i]
        : answer.media[i];

    if (offerMedia && !answerMedia) {
      mediaDiffs.push({
        mid: offerMedia.mid || `m${i}`,
        type: offerMedia.type,
        status: 'missing_in_answer',
        offerDirection: offerMedia.direction,
        directionCompatible: false,
        dtlsCompatible: false,
        codecs: [],
        commonCodecsCount: 0,
        rtcpMuxNegotiated: false,
        bundled: false,
        diagnostics: [
          {
            severity: 'error',
            message: `Offer media section #${i} (${offerMedia.type}) has no corresponding section in Answer.`,
            rfcRef: 'RFC 3264 Section 6',
          },
        ],
      });
      errorsCount++;
      continue;
    }

    if (!offerMedia && answerMedia) {
      mediaDiffs.push({
        mid: answerMedia.mid || `m${i}`,
        type: answerMedia.type,
        status: 'added_in_answer',
        answerDirection: answerMedia.direction,
        directionCompatible: false,
        dtlsCompatible: false,
        codecs: [],
        commonCodecsCount: 0,
        rtcpMuxNegotiated: false,
        bundled: false,
        diagnostics: [
          {
            severity: 'error',
            message: `Answer media section #${i} (${answerMedia.type}) was not requested in Offer. Extra media lines violate offer/answer model.`,
            rfcRef: 'RFC 3264 Section 6',
          },
        ],
      });
      errorsCount++;
      continue;
    }

    // Both offerMedia and answerMedia exist
    const diffSection = compareMediaSection(offerMedia!, answerMedia!, offerBundleMids, answerBundleMids);
    mediaDiffs.push(diffSection);

    for (const diag of diffSection.diagnostics) {
      if (diag.severity === 'error') errorsCount++;
      if (diag.severity === 'warning') warningsCount++;
    }

    if (diffSection.status === 'negotiated') {
      matchedMediaCount++;
      if (diffSection.type === 'audio') audioNegotiated = true;
      if (diffSection.type === 'video') videoNegotiated = true;
    } else {
      rejectedMediaCount++;
    }
  }

  const negotiable = (audioNegotiated || videoNegotiated) && errorsCount === 0;

  return {
    summary: {
      negotiable,
      totalOfferMedia: offer.media.length,
      totalAnswerMedia: answer.media.length,
      matchedMediaCount,
      rejectedMediaCount,
      bundleConfigured: offerBundleMids.size > 0 && answerBundleMids.size > 0,
      dtlsCompatible: mediaDiffs.length > 0 && mediaDiffs.every((m) => m.dtlsCompatible),
      audioNegotiated,
      videoNegotiated,
      warningsCount,
      errorsCount,
    },
    mediaDiffs,
    globalDiagnostics,
  };
}

function compareMediaSection(
  offerMedia: MediaSectionAST,
  answerMedia: MediaSectionAST,
  offerBundleMids: Set<string>,
  answerBundleMids: Set<string>
): MediaDiffResult {
  const diagnostics: Array<{ severity: DiffSeverity; message: string; rfcRef?: string }> = [];
  const mid = offerMedia.mid || answerMedia.mid || 'm';

  // Check if answer rejected the stream (port 0)
  if (answerMedia.port === 0) {
    return {
      mid,
      type: offerMedia.type,
      status: 'rejected',
      offerDirection: offerMedia.direction,
      answerDirection: answerMedia.direction,
      directionCompatible: true,
      dtlsCompatible: true,
      codecs: [],
      commonCodecsCount: 0,
      rtcpMuxNegotiated: false,
      bundled: false,
      diagnostics: [
        {
          severity: 'info',
          message: `Media stream (${offerMedia.type}) was explicitly rejected by the answerer with port 0.`,
          rfcRef: 'RFC 3264 Section 6',
        },
      ],
    };
  }

  // Media type match
  if (offerMedia.type !== answerMedia.type) {
    diagnostics.push({
      severity: 'error',
      message: `Media type mismatch: Offer requested ${offerMedia.type} while Answer replied with ${answerMedia.type}.`,
      rfcRef: 'RFC 3264 Section 6.1',
    });
  }

  // DTLS setup role check (RFC 8842 / RFC 4145)
  const dtlsOfferRole = offerMedia.dtlsRole;
  const dtlsAnswerRole = answerMedia.dtlsRole;
  let dtlsCompatible = true;

  if (dtlsOfferRole && dtlsAnswerRole) {
    if (dtlsOfferRole === 'actpass') {
      if (dtlsAnswerRole !== 'active' && dtlsAnswerRole !== 'passive') {
        dtlsCompatible = false;
        diagnostics.push({
          severity: 'error',
          message: `Invalid DTLS role response: Offer specifies "setup:actpass" so Answer must be "setup:active" or "setup:passive", received "${dtlsAnswerRole}".`,
          rfcRef: 'RFC 8842 Section 5.3',
        });
      }
    } else if (dtlsOfferRole === 'active' && dtlsAnswerRole === 'active') {
      dtlsCompatible = false;
      diagnostics.push({
        severity: 'error',
        message: 'DTLS role conflict: Both Offer and Answer specified "setup:active". One peer must act as DTLS server (passive).',
        rfcRef: 'RFC 8842 Section 5.3',
      });
    } else if (dtlsOfferRole === 'passive' && dtlsAnswerRole === 'passive') {
      dtlsCompatible = false;
      diagnostics.push({
        severity: 'error',
        message: 'DTLS role conflict: Both Offer and Answer specified "setup:passive". One peer must act as DTLS client (active).',
        rfcRef: 'RFC 8842 Section 5.3',
      });
    }
  }

  // Direction compatibility (RFC 3264)
  let directionCompatible = true;
  const offerDir = offerMedia.direction;
  const answerDir = answerMedia.direction;

  if (offerDir === 'sendonly' && answerDir !== 'recvonly' && answerDir !== 'inactive') {
    directionCompatible = false;
    diagnostics.push({
      severity: 'error',
      message: `Incompatible media direction: Offer requested "sendonly", but Answer responded with "${answerDir}" instead of "recvonly" or "inactive".`,
      rfcRef: 'RFC 3264 Section 6.1',
    });
  } else if (offerDir === 'recvonly' && answerDir !== 'sendonly' && answerDir !== 'inactive') {
    directionCompatible = false;
    diagnostics.push({
      severity: 'error',
      message: `Incompatible media direction: Offer requested "recvonly", but Answer responded with "${answerDir}" instead of "sendonly" or "inactive".`,
      rfcRef: 'RFC 3264 Section 6.1',
    });
  }

  // Codec Matching
  const codecMatches: CodecMatch[] = [];
  let commonCodecsCount = 0;

  for (const offerCodec of offerMedia.codecs) {
    const matchingAnswerCodec = answerMedia.codecs.find(
      (ac) =>
        ac.name.toLowerCase() === offerCodec.name.toLowerCase() &&
        (ac.clockRate === offerCodec.clockRate || offerCodec.name.toLowerCase() === 'opus')
    );

    if (matchingAnswerCodec) {
      commonCodecsCount++;
      const isRemapped = offerCodec.payloadType !== matchingAnswerCodec.payloadType;

      let notes: string | undefined;
      if (isRemapped) {
        notes = `Payload type remapped from ${offerCodec.payloadType} to ${matchingAnswerCodec.payloadType}`;
      }

      // Check specific codec parameters
      if (offerCodec.name.toLowerCase() === 'h264') {
        const offerProfile = offerCodec.parameters?.['profile-level-id'];
        const answerProfile = matchingAnswerCodec.parameters?.['profile-level-id'];
        if (offerProfile && answerProfile && offerProfile !== answerProfile) {
          diagnostics.push({
            severity: 'warning',
            message: `H.264 profile-level-id mismatch: Offer=${offerProfile}, Answer=${answerProfile}. Ensure decoders support negotiation level.`,
            rfcRef: 'RFC 6184 Section 8.2.2',
          });
        }
      }

      codecMatches.push({
        name: offerCodec.name,
        offerPayloadType: offerCodec.payloadType,
        answerPayloadType: matchingAnswerCodec.payloadType,
        clockRate: offerCodec.clockRate,
        channels: offerCodec.channels,
        status: isRemapped ? 'remapped' : 'agreed',
        offerParams: offerCodec.parameters,
        answerParams: matchingAnswerCodec.parameters,
        notes,
      });
    } else {
      codecMatches.push({
        name: offerCodec.name,
        offerPayloadType: offerCodec.payloadType,
        answerPayloadType: -1,
        clockRate: offerCodec.clockRate,
        channels: offerCodec.channels,
        status: 'rejected',
        offerParams: offerCodec.parameters,
        notes: 'Rejected or not included by Answerer',
      });
    }
  }

  if (commonCodecsCount === 0) {
    diagnostics.push({
      severity: 'error',
      message: `No mutually supported codecs negotiated for ${offerMedia.type}. Audio/Video decoding will fail.`,
      rfcRef: 'RFC 3264 Section 6.1',
    });
  }

  // RTCP-Mux
  const rtcpMuxNegotiated = offerMedia.rtcpMux && answerMedia.rtcpMux;
  if (offerMedia.rtcpMux && !answerMedia.rtcpMux) {
    diagnostics.push({
      severity: 'warning',
      message: 'Offer requested rtcp-mux, but Answer did not negotiate it. Separate RTCP port allocations required.',
      rfcRef: 'RFC 5761 Section 5.1.1',
    });
  }

  const bundled = offerBundleMids.has(mid) && answerBundleMids.has(mid);
  const status = commonCodecsCount > 0 && dtlsCompatible && directionCompatible ? 'negotiated' : 'rejected';

  return {
    mid,
    type: offerMedia.type,
    status,
    offerDirection: offerDir,
    answerDirection: answerDir,
    directionCompatible,
    dtlsOfferRole,
    dtlsAnswerRole,
    dtlsCompatible,
    codecs: codecMatches,
    commonCodecsCount,
    rtcpMuxNegotiated,
    bundled,
    diagnostics,
  };
}
