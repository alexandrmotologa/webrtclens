/**
 * WebRTCLens - RFC 8866 SDP Parser and Normalizer
 */

import sdpTransform from 'sdp-transform';
import type {
  SessionDescriptionAST,
  MediaSectionAST,
  CodecInfo,
  DtlsFingerprint,
  DtlsRole,
  MediaDirection,
  MediaType,
  CandidateInfo,
} from './types.js';

export function parseSdp(rawSdp: string): SessionDescriptionAST {
  if (!rawSdp || typeof rawSdp !== 'string') {
    throw new Error('Invalid SDP input: expected a non-empty string');
  }

  const parsed = sdpTransform.parse(rawSdp.trim());

  const bundleGroups: Array<{ semantics: string; mids: string[] }> = [];
  if (parsed.groups) {
    for (const g of parsed.groups) {
      bundleGroups.push({
        semantics: (g as any).semantics || g.type || 'BUNDLE',
        mids: (g.mids || '').split(' ').filter(Boolean),
      });
    }
  }

  const mediaSections: MediaSectionAST[] = [];

  for (const m of parsed.media || []) {
    const rawMediaText = rawSdp
      .split(/\r?\nm=/)
      .slice(1)
      .find((chunk) => chunk.startsWith(`${m.type} ${m.port}`)) || '';

    // Codecs and rtpmap
    const codecs: CodecInfo[] = [];
    const rtpMap = m.rtp || [];
    const fmtpMap = m.fmtp || [];

    for (const r of rtpMap) {
      const fmtpEntry = fmtpMap.find((f) => f.payload === r.payload);
      let parameters: Record<string, string> | undefined;

      if (fmtpEntry && fmtpEntry.config) {
        parameters = {};
        const pairs = fmtpEntry.config.split(';');
        for (const pair of pairs) {
          const trimmed = pair.trim();
          if (!trimmed) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            parameters[key] = val;
          } else {
            parameters[trimmed] = '1';
          }
        }
      }

      const rtcpFeedback: string[] = [];
      if (m.rtcpFb) {
        for (const fb of m.rtcpFb) {
          if (fb.payload === r.payload || fb.payload === '*') {
            rtcpFeedback.push(fb.subtype ? `${fb.type} ${fb.subtype}` : fb.type);
          }
        }
      }

      codecs.push({
        payloadType: r.payload,
        name: r.codec,
        clockRate: r.rate || 0,
        channels: r.encoding || undefined,
        parameters,
        rtcpFeedback: rtcpFeedback.length > 0 ? rtcpFeedback : undefined,
      });
    }

    // Direction
    let direction: MediaDirection = 'sendrecv';
    if (m.direction) {
      direction = m.direction as MediaDirection;
    } else if (parsed.direction) {
      direction = parsed.direction as MediaDirection;
    }

    // DTLS Fingerprints
    const fingerprints: DtlsFingerprint[] = [];
    if (m.fingerprint) {
      fingerprints.push({
        algorithm: m.fingerprint.type,
        hash: m.fingerprint.hash,
      });
    } else if (parsed.fingerprint) {
      fingerprints.push({
        algorithm: parsed.fingerprint.type,
        hash: parsed.fingerprint.hash,
      });
    }

    // DTLS Setup role
    const dtlsRole = (m.setup || parsed.setup) as DtlsRole | undefined;

    // ICE credentials
    const ice = {
      ufrag: m.iceUfrag || parsed.iceUfrag,
      pwd: m.icePwd || parsed.icePwd,
      options: (m.iceOptions || parsed.iceOptions || '').split(' ').filter(Boolean),
    };

    // Candidates
    const candidates: CandidateInfo[] = [];
    if (m.candidates) {
      for (const c of m.candidates) {
        candidates.push({
          foundation: c.foundation,
          component: c.component,
          transport: (c.transport?.toLowerCase() as 'udp' | 'tcp') || 'udp',
          priority: c.priority,
          ip: c.ip,
          port: c.port,
          type: (c.type as 'host' | 'srflx' | 'prflx' | 'relay') || 'host',
          raddr: c.raddr,
          rport: c.rport,
          tcptype: c.tcptype,
          generation: c.generation !== undefined ? String(c.generation) : undefined,
          raw: `candidate:${c.foundation} ${c.component} ${c.transport} ${c.priority} ${c.ip} ${c.port} typ ${c.type}`,
        });
      }
    }

    mediaSections.push({
      mid: m.mid !== undefined ? String(m.mid) : undefined,
      type: (m.type as MediaType) || 'audio',
      port: m.port,
      protocol: m.protocol,
      direction,
      codecs,
      dtlsRole,
      fingerprints,
      ice,
      candidates,
      rtcpMux: Boolean(m.rtcpMux),
      rtcpRsize: Boolean(m.rtcpRsize),
      ssrcs: m.ssrcs?.map((s) => ({ id: s.id, attribute: s.attribute, value: s.value || '' })),
      bandwidth: m.bandwidth && m.bandwidth.length > 0 ? { type: m.bandwidth[0].type, limit: m.bandwidth[0].limit } : undefined,
      raw: `m=${rawMediaText}`,
    });
  }

  return {
    version: parsed.version || 0,
    origin: {
      username: parsed.origin?.username || '-',
      sessionId: String(parsed.origin?.sessionId || '0'),
      sessionVersion: String(parsed.origin?.sessionVersion || '0'),
      netType: parsed.origin?.netType || 'IN',
      addrType: parsed.origin?.ipVer ? `IP${parsed.origin.ipVer}` : 'IP4',
      unicastAddress: parsed.origin?.address || '0.0.0.0',
    },
    sessionName: parsed.name || '-',
    timing: {
      start: parsed.timing?.start || 0,
      stop: parsed.timing?.stop || 0,
    },
    connection: parsed.connection
      ? {
          netType: (parsed.connection as any).netType || 'IN',
          addrType: `IP${parsed.connection.version}`,
          ip: parsed.connection.ip,
        }
      : undefined,
    bundleGroups,
    media: mediaSections,
    raw: rawSdp,
  };
}
