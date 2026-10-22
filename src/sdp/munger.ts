/**
 * WebRTCLens - SDP Munger and Codec Stripper (RFC 8866 compliant)
 */

import sdpTransform from 'sdp-transform';

export interface SdpMungeOptions {
  stripCodecs?: string[]; // e.g. ['VP8', 'H264']
  preferredCodec?: { mediaType: 'audio' | 'video'; codecName: string };
  bitrateCapKbps?: number;
  dtlsRole?: 'actpass' | 'active' | 'passive' | 'holdconn';
  enableBundle?: boolean;
  enableRtcpMux?: boolean;
  opusStereo?: boolean;
  opusInbandFec?: boolean;
  opusMinPtime?: number;
}

/**
 * Strips specific codecs from raw SDP text, updating m= line payload types,
 * rtpmap, fmtp, and rtcp-fb attributes cleanly.
 */
export function stripCodecsFromSdp(rawSdp: string, codecsToStrip: string[]): string {
  if (!codecsToStrip || codecsToStrip.length === 0) return rawSdp;

  const parsed = sdpTransform.parse(rawSdp);
  const targets = new Set(codecsToStrip.map((c) => c.toLowerCase()));

  for (const m of parsed.media) {
    if (!m.rtp) continue;

    const payloadsToDrop = new Set<number>();
    const remainingRtp: any[] = [];

    for (const r of m.rtp) {
      if (targets.has(r.codec.toLowerCase())) {
        payloadsToDrop.add(r.payload);
      } else {
        remainingRtp.push(r);
      }
    }

    // Update payload list on m= line
    const currentPayloads = (m.payloads || '').split(' ').filter(Boolean);
    const filteredPayloads = currentPayloads.filter((pt) => !payloadsToDrop.has(Number(pt)));

    m.payloads = filteredPayloads.join(' ');
    m.rtp = remainingRtp;

    // Filter fmtp
    if (m.fmtp) {
      m.fmtp = m.fmtp.filter((f) => !payloadsToDrop.has(Number(f.payload)));
    }

    // Filter rtcp-fb
    if (m.rtcpFb) {
      m.rtcpFb = m.rtcpFb.filter((fb) => !payloadsToDrop.has(Number(fb.payload)));
    }
  }

  return sdpTransform.write(parsed);
}

/**
 * Reorders payloads so the preferred codec is listed first on the m= line
 */
export function preferCodecInSdp(rawSdp: string, mediaType: 'audio' | 'video', preferredCodecName: string): string {
  const parsed = sdpTransform.parse(rawSdp);
  const targetName = preferredCodecName.toLowerCase();

  for (const m of parsed.media) {
    if (m.type !== mediaType || !m.rtp) continue;

    const matchingRtp = m.rtp.find((r) => r.codec.toLowerCase() === targetName);
    if (!matchingRtp) continue;

    const targetPayload = String(matchingRtp.payload);
    const currentPayloads = (m.payloads || '').split(' ').filter(Boolean);

    const reordered = [
      targetPayload,
      ...currentPayloads.filter((pt) => pt !== targetPayload),
    ];

    m.payloads = reordered.join(' ');
    m.rtp = [
      matchingRtp,
      ...m.rtp.filter((r) => r.payload !== matchingRtp.payload),
    ];
  }

  return sdpTransform.write(parsed);
}

/**
 * Applies multiple modifications to an SDP string in a single pass
 */
export function mungeSdp(rawSdp: string, options: SdpMungeOptions): string {
  let sdp = rawSdp;

  if (options.stripCodecs && options.stripCodecs.length > 0) {
    sdp = stripCodecsFromSdp(sdp, options.stripCodecs);
  }

  if (options.preferredCodec) {
    sdp = preferCodecInSdp(sdp, options.preferredCodec.mediaType, options.preferredCodec.codecName);
  }

  const parsed = sdpTransform.parse(sdp);

  // DTLS Role
  if (options.dtlsRole) {
    parsed.setup = options.dtlsRole;
    for (const m of parsed.media) {
      if (m.setup) m.setup = options.dtlsRole;
    }
  }

  // BUNDLE Multiplexing
  if (options.enableBundle !== undefined) {
    if (options.enableBundle) {
      const allMids = parsed.media.map((m) => m.mid).filter(Boolean).map(String);
      if (allMids.length > 0) {
        parsed.groups = [{ type: 'BUNDLE', mids: allMids.join(' ') }];
      }
    } else {
      parsed.groups = [];
    }
  }

  // rtcp-mux
  if (options.enableRtcpMux !== undefined) {
    for (const m of parsed.media) {
      if (options.enableRtcpMux) {
        m.rtcpMux = 'rtcp-mux';
      } else {
        delete (m as any).rtcpMux;
      }
    }
  }

  // Bitrate limit (b=AS / b=TIAS)
  if (options.bitrateCapKbps !== undefined && options.bitrateCapKbps > 0) {
    for (const m of parsed.media) {
      m.bandwidth = [{ type: 'AS', limit: options.bitrateCapKbps }];
    }
  }

  // Opus format parameters (stereo, inband FEC, minptime)
  if (options.opusStereo !== undefined || options.opusInbandFec !== undefined || options.opusMinPtime !== undefined) {
    for (const m of parsed.media) {
      if (m.type !== 'audio' || !m.rtp) continue;
      const opusRtp = m.rtp.find((r) => r.codec.toLowerCase() === 'opus');
      if (!opusRtp) continue;

      if (!m.fmtp) m.fmtp = [];
      let opusFmtp = m.fmtp.find((f) => f.payload === opusRtp.payload);
      if (!opusFmtp) {
        opusFmtp = { payload: opusRtp.payload, config: '' };
        m.fmtp.push(opusFmtp);
      }

      const params = new Map<string, string>();
      if (opusFmtp.config) {
        for (const pair of opusFmtp.config.split(';')) {
          const [k, v] = pair.split('=');
          if (k) params.set(k.trim(), v ? v.trim() : '1');
        }
      }

      if (options.opusStereo !== undefined) {
        params.set('stereo', options.opusStereo ? '1' : '0');
        params.set('sprop-stereo', options.opusStereo ? '1' : '0');
      }
      if (options.opusInbandFec !== undefined) {
        params.set('useinbandfec', options.opusInbandFec ? '1' : '0');
      }
      if (options.opusMinPtime !== undefined) {
        params.set('minptime', String(options.opusMinPtime));
      }

      opusFmtp.config = Array.from(params.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join(';');
    }
  }

  return sdpTransform.write(parsed);
}
