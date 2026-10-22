/**
 * WebRTCLens - Real-world SDP Offer/Answer Presets
 */

export interface SdpSample {
  id: string;
  title: string;
  description: string;
  category: 'standard' | 'mismatch' | 'gateway' | 'advanced';
  offer: string;
  answer: string;
}

export const SDP_SAMPLES: SdpSample[] = [
  {
    id: 'standard-p2p',
    title: 'Standard Chrome to Firefox P2P (Opus + VP8)',
    description: 'Clean negotiation between two modern browsers with BUNDLE multiplexing, DTLS actpass/active, and matching Opus and VP8 codecs.',
    category: 'standard',
    offer: `v=0
o=- 482019482019 2 IN IP4 127.0.0.1
s=WebRTCLens P2P Call
t=0 0
a=group:BUNDLE 0 1
a=msid-semantic: WMS
m=audio 9 UDP/TLS/RTP/SAVPF 111 9 0 8 126
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:K4tF
a=ice-pwd:9gP+YgX8g+3f6nS2vH
a=ice-options:trickle
a=fingerprint:sha-256 A4:12:F1:C9:88:82:11:42:DE:45:90:12:33:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC
a=setup:actpass
a=mid:0
a=sendrecv
a=rtcp-mux
a=rtpmap:111 opus/48000/2
a=fmtp:111 minptime=10;useinbandfec=1
a=rtpmap:9 G722/8000
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=rtpmap:126 telephone-event/8000
m=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:K4tF
a=ice-pwd:9gP+YgX8g+3f6nS2vH
a=ice-options:trickle
a=fingerprint:sha-256 A4:12:F1:C9:88:82:11:42:DE:45:90:12:33:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC
a=setup:actpass
a=mid:1
a=sendrecv
a=rtcp-mux
a=rtcp-rsize
a=rtpmap:96 VP8/90000
a=rtcp-fb:96 goog-remb
a=rtcp-fb:96 nack
a=rtcp-fb:96 nack pli
a=rtpmap:97 rtx/90000
a=fmtp:97 apt=96
a=rtpmap:98 VP9/90000
a=rtpmap:99 H264/90000
a=fmtp:99 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f`,
    answer: `v=0
o=- 918239182391 2 IN IP4 127.0.0.1
s=WebRTCLens P2P Call
t=0 0
a=group:BUNDLE 0 1
m=audio 9 UDP/TLS/RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:r8Xz
a=ice-pwd:mP2aK9vL1cO0tQ5w
a=ice-options:trickle
a=fingerprint:sha-256 5B:99:12:AA:77:43:21:00:EE:FF:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88
a=setup:active
a=mid:0
a=sendrecv
a=rtcp-mux
a=rtpmap:111 opus/48000/2
a=fmtp:111 minptime=10;useinbandfec=1
m=video 9 UDP/TLS/RTP/SAVPF 96 97
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:r8Xz
a=ice-pwd:mP2aK9vL1cO0tQ5w
a=ice-options:trickle
a=fingerprint:sha-256 5B:99:12:AA:77:43:21:00:EE:FF:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88
a=setup:active
a=mid:1
a=sendrecv
a=rtcp-mux
a=rtcp-rsize
a=rtpmap:96 VP8/90000
a=rtcp-fb:96 goog-remb
a=rtcp-fb:96 nack
a=rtcp-fb:96 nack pli
a=rtpmap:97 rtx/90000
a=fmtp:97 apt=96`,
  },
  {
    id: 'h264-profile-mismatch',
    title: 'H.264 Profile-Level-ID Mismatch',
    description: 'Offerer requests High Profile 1080p (64002a), but Answerer accepts with Constrained Baseline Profile (42e01f), causing video negotiation warnings.',
    category: 'mismatch',
    offer: `v=0
o=- 718291029 2 IN IP4 127.0.0.1
s=H264 Mismatch Demo
t=0 0
m=video 9 UDP/TLS/RTP/SAVPF 102
c=IN IP4 0.0.0.0
a=rtcp-mux
a=mid:video
a=sendrecv
a=setup:actpass
a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99
a=rtpmap:102 H264/90000
a=fmtp:102 packetization-mode=1;profile-level-id=64002a`,
    answer: `v=0
o=- 829102931 2 IN IP4 127.0.0.1
s=H264 Mismatch Demo
t=0 0
m=video 9 UDP/TLS/RTP/SAVPF 102
c=IN IP4 0.0.0.0
a=rtcp-mux
a=mid:video
a=sendrecv
a=setup:active
a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF
a=rtpmap:102 H264/90000
a=fmtp:102 packetization-mode=1;profile-level-id=42e01f`,
  },
  {
    id: 'sip-pstn-gateway',
    title: 'WebRTC to SIP / PSTN Gateway (Video Rejected)',
    description: 'Offerer proposes Opus voice and VP8 video. Legacy SIP gateway drops video via port 0 and accepts only standard G.711 PCMU audio.',
    category: 'gateway',
    offer: `v=0
o=- 120938102 2 IN IP4 10.0.0.50
s=WebRTC to SIP
t=0 0
a=group:BUNDLE 0 1
m=audio 9 UDP/TLS/RTP/SAVPF 111 0 8
c=IN IP4 0.0.0.0
a=mid:0
a=sendrecv
a=setup:actpass
a=fingerprint:sha-256 12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF
a=rtpmap:111 opus/48000/2
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
m=video 9 UDP/TLS/RTP/SAVPF 96
c=IN IP4 0.0.0.0
a=mid:1
a=sendrecv
a=setup:actpass
a=fingerprint:sha-256 12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF
a=rtpmap:96 VP8/90000`,
    answer: `v=0
o=FreeSWITCH 1592819 1 IN IP4 192.168.1.10
s=FreeSWITCH
t=0 0
m=audio 16402 UDP/TLS/RTP/SAVPF 0
c=IN IP4 192.168.1.10
a=mid:0
a=sendrecv
a=setup:passive
a=fingerprint:sha-256 FF:EE:DD:CC:BB:AA:00:99:88:77:66:55:44:33:22:11:FF:EE:DD:CC:BB:AA:00:99:88:77:66:55:44:33:22:11
a=rtpmap:0 PCMU/8000
m=video 0 UDP/TLS/RTP/SAVPF 96
c=IN IP4 0.0.0.0
a=mid:1`,
  },
  {
    id: 'dtls-role-conflict',
    title: 'DTLS Role Collision (Both Active)',
    description: 'Fatal configuration error where both peers set setup:active, resulting in immediate DTLS handshake failure.',
    category: 'mismatch',
    offer: `v=0
o=- 33445566 2 IN IP4 127.0.0.1
s=Role Collision
t=0 0
m=audio 9 UDP/TLS/RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=mid:audio
a=sendrecv
a=setup:active
a=fingerprint:sha-256 AA:11:22:33:44:55:66:77:88:99:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55
a=rtpmap:111 opus/48000/2`,
    answer: `v=0
o=- 77889900 2 IN IP4 127.0.0.1
s=Role Collision
t=0 0
m=audio 9 UDP/TLS/RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=mid:audio
a=sendrecv
a=setup:active
a=fingerprint:sha-256 BB:22:33:44:55:66:77:88:99:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66
a=rtpmap:111 opus/48000/2`,
  },
];
