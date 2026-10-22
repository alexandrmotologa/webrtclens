/**
 * WebRTCLens - SDP Formatter and RFC Reference Dictionary
 */

export interface AttributeExplainer {
  attribute: string;
  category: 'session' | 'media' | 'transport' | 'security' | 'ice';
  rfc: string;
  summary: string;
  example: string;
}

export const SDP_ATTRIBUTE_DICTIONARY: Record<string, AttributeExplainer> = {
  rtpmap: {
    attribute: 'a=rtpmap',
    category: 'media',
    rfc: 'RFC 8866 Section 6.6',
    summary: 'Maps an RTP payload type number to a codec encoding name, clock rate, and optional channel count.',
    example: 'a=rtpmap:111 opus/48000/2',
  },
  fmtp: {
    attribute: 'a=fmtp',
    category: 'media',
    rfc: 'RFC 8866 Section 6.7',
    summary: 'Specifies format-specific parameters for a payload type such as profile levels, packetization modes, or bitrate constraints.',
    example: 'a=fmtp:111 minptime=10;useinbandfec=1',
  },
  fingerprint: {
    attribute: 'a=fingerprint',
    category: 'security',
    rfc: 'RFC 8122 Section 5',
    summary: 'Carries the cryptographic hash of the X.509 certificate used for DTLS transport layer handshake.',
    example: 'a=fingerprint:sha-256 4A:AD:B9:B1:3F:...',
  },
  setup: {
    attribute: 'a=setup',
    category: 'security',
    rfc: 'RFC 8842 Section 5',
    summary: 'Defines DTLS role negotiation. Offer uses actpass; Answer chooses active (client) or passive (server).',
    example: 'a=setup:actpass',
  },
  'ice-ufrag': {
    attribute: 'a=ice-ufrag',
    category: 'ice',
    rfc: 'RFC 8445 Section 5.3',
    summary: 'Interactive Connectivity Establishment (ICE) username fragment used for STUN authentication between peers.',
    example: 'a=ice-ufrag:8xYz',
  },
  'ice-pwd': {
    attribute: 'a=ice-pwd',
    category: 'ice',
    rfc: 'RFC 8445 Section 5.3',
    summary: 'ICE password paired with ice-ufrag for MESSAGE-INTEGRITY verification in STUN connectivity checks.',
    example: 'a=ice-pwd:secretIcePassword123',
  },
  candidate: {
    attribute: 'a=candidate',
    category: 'ice',
    rfc: 'RFC 8445 Section 5.1',
    summary: 'A transport address (IP and port) gathered for peer-to-peer connectivity (host, srflx, prflx, or relay).',
    example: 'a=candidate:1 1 UDP 2130706431 192.168.1.100 50000 typ host',
  },
  mid: {
    attribute: 'a=mid',
    category: 'media',
    rfc: 'RFC 8843 Section 4',
    summary: 'Media Stream Identification tag used to correlate RTP packets to specific media sections under BUNDLE.',
    example: 'a=mid:audio',
  },
  group: {
    attribute: 'a=group',
    category: 'transport',
    rfc: 'RFC 8843 Section 7',
    summary: 'Groups multiple media streams onto a single 5-tuple transport using BUNDLE multiplexing.',
    example: 'a=group:BUNDLE 0 1',
  },
  'rtcp-mux': {
    attribute: 'a=rtcp-mux',
    category: 'transport',
    rfc: 'RFC 5761 Section 5.1',
    summary: 'Multiplexes RTP and RTCP packets onto the exact same UDP port, halving firewall NAT allocations.',
    example: 'a=rtcp-mux',
  },
  sendrecv: {
    attribute: 'a=sendrecv',
    category: 'media',
    rfc: 'RFC 8866 Section 6.13',
    summary: 'Bidirectional media flow: the endpoint will both transmit and receive packets.',
    example: 'a=sendrecv',
  },
  sendonly: {
    attribute: 'a=sendonly',
    category: 'media',
    rfc: 'RFC 8866 Section 6.13',
    summary: 'Unidirectional media flow: the endpoint will only send packets, ignoring inbound media.',
    example: 'a=sendonly',
  },
  recvonly: {
    attribute: 'a=recvonly',
    category: 'media',
    rfc: 'RFC 8866 Section 6.13',
    summary: 'Unidirectional media flow: the endpoint will only receive packets, generating no outbound stream.',
    example: 'a=recvonly',
  },
};

export function lookupAttribute(attributeLine: string): AttributeExplainer | undefined {
  const match = attributeLine.match(/^a=([a-zA-Z0-9-]+)/);
  if (!match) return undefined;
  const key = match[1].toLowerCase();
  return SDP_ATTRIBUTE_DICTIONARY[key];
}
