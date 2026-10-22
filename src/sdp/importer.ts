/**
 * WebRTCLens - Chrome & Firefox WebRTC Internals Log Importer
 */

export interface ImportedWebRtcSession {
  success: boolean;
  peerConnectionId?: string;
  offer?: string;
  answer?: string;
  localCandidates: string[];
  remoteCandidates: string[];
  eventsCount: number;
  extractedFrom: 'chrome_internals_json' | 'firefox_about_webrtc' | 'raw_sdp_dump';
  error?: string;
}

export function importWebRtcDump(rawInput: string): ImportedWebRtcSession {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      success: false,
      localCandidates: [],
      remoteCandidates: [],
      eventsCount: 0,
      extractedFrom: 'raw_sdp_dump',
      error: 'Empty or invalid input',
    };
  }

  const trimmed = rawInput.trim();

  // Try 1: Chrome webrtc-internals JSON format
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const data = JSON.parse(trimmed);
      return parseChromeInternalsJson(data);
    } catch {
      // Not valid JSON, proceed to text parsing
    }
  }

  // Try 2: Firefox about:webrtc or text dump
  return parseTextDump(trimmed);
}

function parseChromeInternalsJson(data: any): ImportedWebRtcSession {
  const localCandidates: string[] = [];
  const remoteCandidates: string[] = [];
  let offer: string | undefined;
  let answer: string | undefined;
  let pcId: string | undefined;
  let eventsCount = 0;

  // In Chrome webrtc-internals dumps, peer connections are keys in data (or data.PeerConnections)
  const pcs = data.PeerConnections || data;

  for (const [key, val] of Object.entries(pcs)) {
    if (typeof val !== 'object' || !val) continue;
    const pcData = val as any;

    if (pcData.updateLog && Array.isArray(pcData.updateLog)) {
      pcId = key;
      eventsCount += pcData.updateLog.length;

      for (const log of pcData.updateLog) {
        const type = log.type || '';
        const value = log.value || '';

        // Extract Local / Remote SDP
        if (type.includes('setLocalDescription') || type.includes('createOfferOnSuccess')) {
          const sdpMatch = extractSdpFromLog(value);
          if (sdpMatch && !offer) {
            offer = sdpMatch;
          }
        } else if (type.includes('setRemoteDescription') || type.includes('createAnswerOnSuccess')) {
          const sdpMatch = extractSdpFromLog(value);
          if (sdpMatch && !answer) {
            answer = sdpMatch;
          }
        }

        // Extract Candidates
        if (type.includes('onicecandidate')) {
          const candMatch = extractCandidateFromLog(value);
          if (candMatch) localCandidates.push(candMatch);
        } else if (type.includes('addIceCandidate')) {
          const candMatch = extractCandidateFromLog(value);
          if (candMatch) remoteCandidates.push(candMatch);
        }
      }

      if (offer || answer) break; // Found active PC
    }
  }

  return {
    success: Boolean(offer || answer || localCandidates.length > 0),
    peerConnectionId: pcId,
    offer,
    answer,
    localCandidates,
    remoteCandidates,
    eventsCount,
    extractedFrom: 'chrome_internals_json',
  };
}

function parseTextDump(text: string): ImportedWebRtcSession {
  const localCandidates: string[] = [];
  const remoteCandidates: string[] = [];
  let offer: string | undefined;
  let answer: string | undefined;

  // Look for SDP sections (starts with v=0)
  const sdpBlocks = text.split(/(?=v=0)/g).filter((b) => b.trim().startsWith('v=0'));

  if (sdpBlocks.length >= 2) {
    offer = sdpBlocks[0].trim();
    answer = sdpBlocks[1].trim();
  } else if (sdpBlocks.length === 1) {
    offer = sdpBlocks[0].trim();
  }

  // Look for candidate lines
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('candidate:') || trimmed.startsWith('a=candidate:')) {
      localCandidates.push(trimmed.startsWith('a=') ? trimmed.slice(2) : trimmed);
    }
  }

  return {
    success: Boolean(offer || answer || localCandidates.length > 0),
    offer,
    answer,
    localCandidates,
    remoteCandidates,
    eventsCount: lines.length,
    extractedFrom: text.includes('about:webrtc') ? 'firefox_about_webrtc' : 'raw_sdp_dump',
  };
}

function extractSdpFromLog(value: any): string | undefined {
  if (typeof value === 'string') {
    const vIndex = value.indexOf('v=0');
    if (vIndex !== -1) {
      return value.slice(vIndex).trim();
    }
  } else if (value && typeof value === 'object' && value.sdp) {
    return value.sdp.trim();
  }
  return undefined;
}

function extractCandidateFromLog(value: any): string | undefined {
  if (typeof value === 'string') {
    const m = value.match(/candidate:[^\r\n"']+/);
    if (m) return m[0].trim();
  } else if (value && typeof value === 'object' && value.candidate) {
    return value.candidate.trim();
  }
  return undefined;
}
