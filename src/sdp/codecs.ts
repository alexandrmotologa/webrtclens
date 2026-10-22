/**
 * WebRTCLens - Codec Database & Lookup
 */

export interface CodecDefinition {
  name: string;
  type: 'audio' | 'video' | 'data';
  defaultClockRate: number;
  channels?: number;
  description: string;
  rfc: string;
  importantParams?: string[];
}

export const KNOWN_CODECS: Record<string, CodecDefinition> = {
  opus: {
    name: 'opus',
    type: 'audio',
    defaultClockRate: 48000,
    channels: 2,
    description: 'Lossy audio coding format developed by IETF, default for WebRTC voice and music.',
    rfc: 'RFC 7587',
    importantParams: ['minptime', 'useinbandfec', 'stereo', 'sprop-stereo', 'maxaveragebitrate'],
  },
  isac: {
    name: 'ISAC',
    type: 'audio',
    defaultClockRate: 16000,
    channels: 1,
    description: 'Wideband speech codec originally developed by Global IP Solutions.',
    rfc: 'RFC 7845',
  },
  g722: {
    name: 'G722',
    type: 'audio',
    defaultClockRate: 8000,
    channels: 1,
    description: 'ITU-T standard 7 kHz wideband audio codec operating at 64 kbit/s.',
    rfc: 'RFC 3551',
  },
  pcmu: {
    name: 'PCMU',
    type: 'audio',
    defaultClockRate: 8000,
    channels: 1,
    description: 'G.711 mu-law 64 kbit/s audio codec widely used in North America and Japan PSTN.',
    rfc: 'RFC 3551',
  },
  pcma: {
    name: 'PCMA',
    type: 'audio',
    defaultClockRate: 8000,
    channels: 1,
    description: 'G.711 A-law 64 kbit/s audio codec standard throughout Europe and rest of world.',
    rfc: 'RFC 3551',
  },
  telephone_event: {
    name: 'telephone-event',
    type: 'audio',
    defaultClockRate: 8000,
    description: 'DTMF tones and telephony signals in RTP.',
    rfc: 'RFC 4733',
  },
  vp8: {
    name: 'VP8',
    type: 'video',
    defaultClockRate: 90000,
    description: 'Open video format developed by On2 Technologies and open-sourced by Google.',
    rfc: 'RFC 7741',
  },
  vp9: {
    name: 'VP9',
    type: 'video',
    defaultClockRate: 90000,
    description: 'High efficiency open video codec successor to VP8, supports scalable video coding (SVC).',
    rfc: 'RFC 7741 / draft-ietf-payload-vp9',
    importantParams: ['profile-id'],
  },
  h264: {
    name: 'H264',
    type: 'video',
    defaultClockRate: 90000,
    description: 'Advanced Video Coding (AVC) standard with widespread hardware decoder acceleration.',
    rfc: 'RFC 6184',
    importantParams: ['profile-level-id', 'packetization-mode', 'level-asymmetry-allowed'],
  },
  av1: {
    name: 'AV1',
    type: 'video',
    defaultClockRate: 90000,
    description: 'AOMedia Video 1, royalty-free successor to VP9 with superior compression efficiency.',
    rfc: 'RFC 9598',
    importantParams: ['profile', 'level-idx'],
  },
  rtx: {
    name: 'rtx',
    type: 'video',
    defaultClockRate: 90000,
    description: 'RTP Retransmission payload format for packet loss resilience.',
    rfc: 'RFC 4588',
    importantParams: ['apt', 'rtx-time'],
  },
  red: {
    name: 'red',
    type: 'audio',
    defaultClockRate: 48000,
    description: 'RTP Payload for Redundant Audio Data.',
    rfc: 'RFC 2198',
  },
  ulpfec: {
    name: 'ulpfec',
    type: 'video',
    defaultClockRate: 90000,
    description: 'Uneven Level Protection Forward Error Correction.',
    rfc: 'RFC 5109',
  },
};

export function lookupCodec(name: string): CodecDefinition | undefined {
  const normalized = name.toLowerCase();
  for (const [key, def] of Object.entries(KNOWN_CODECS)) {
    if (key.toLowerCase() === normalized || def.name.toLowerCase() === normalized) {
      return def;
    }
  }
  return undefined;
}
