# WebRTCLens Architecture and Protocol Specification

WebRTCLens provides protocol inspection, network measurement, and diagnostic tooling for WebRTC developers. This document describes the internal subsystems, binary wire formats, state machines, and mathematical formulas implemented in the engine.

---

## 1. Subsystem Architecture

```
+----------------------------------------------------------------------------------------+
|                                    CLI & HTTP API                                      |
|                       (Commander.js / Fastify 5 REST & SSE)                           |
+-------------------------------------------+--------------------------------------------+
                                            |
        +-----------------------------------+------------------------------------+
        |                                   |                                    |
+-------v---------------------+   +---------v--------------------+   +-----------v-------+
|       SDP Diff Subsystem    |   |     STUN / TURN Subsystem    |   |   ICE Topology    |
| * RFC 8866 / RFC 4566 AST   |   | * RFC 5389 STUN Binding      |   | * Candidate Parse |
| * Codec Match Matrix        |   | * RFC 8656 TURN Allocation   |   | * RFC 5245 Pairs  |
| * DTLS Role Compatibility   |   | * UDP / TCP / TLS Transports |   | * Gathering State |
| * Direction & BUNDLE Rules  |   | * RTT & XOR-MAPPED-ADDRESS   |   | * Diagnostic Tree |
+-----------------------------+   +------------------------------+   +-------------------+
                                            |
                                  +---------v--------------------+
                                  |    Loopback & Chaos Studio   |
                                  | * Dual RTCPeerConnection     |
                                  | * Synthetic Canvas Video     |
                                  | * Web Audio Tone Generator   |
                                  | * Packet Drop & Jitter Emul  |
                                  | * RTCStats Delta Telemetry   |
                                  +------------------------------+
```

---

## 2. Session Description Protocol (SDP) Diff Subsystem

The SDP engine consumes raw SDP text and generates a typed Abstract Syntax Tree (AST) conforming to RFC 8866 (obsoleting RFC 4566).

### 2.1 AST Structure
- **Session Level**:
  - `v`: Protocol version (always 0).
  - `o`: Originator credentials (username, session ID, session version, network type, address type, unicast address).
  - `s`: Session identifier name.
  - `t`: Active timing intervals (`t=0 0`).
  - `c`: Default connection data (`IN IP4 0.0.0.0`).
  - `a=group:BUNDLE`: Media stream multiplexing declarations.
  - `a=msid-semantic`: Stream grouping semantics.
- **Media Level (`m=audio`, `m=video`, `m=application`)**:
  - Transport parameters (`UDP/TLS/RTP/SAVPF`).
  - Codec maps (`a=rtpmap:<pt> <codec>/<clock>/<channels>`).
  - Format parameters (`a=fmtp:<pt> <config>`).
  - Cryptographic parameters (`a=fingerprint:<hash-func> <hex-fingerprint>`, `a=setup:<actpass|active|passive>`).
  - ICE attributes (`a=ice-ufrag`, `a=ice-pwd`, `a=ice-options`, `a=candidate`).
  - Flow direction (`a=sendrecv`, `a=sendonly`, `a=recvonly`, `a=inactive`).

### 2.2 Semantic Negotiation Rules
1. **Codec Matching**: A media track negotiates successfully only when at least one codec name and clock rate present in the Offer is accepted in the Answer. If the Answer returns port 0, the entire media section is considered rejected.
2. **Payload Type Preservation**: Answers may remap dynamic payload types (96 to 127), but standard practice preserves offerer payload types. WebRTCLens flags remaps and warns when parameter options (e.g. H.264 `packetization-mode` or `profile-level-id`) do not match.
3. **DTLS Role Alignment**:
   - Offer with `setup:actpass` can be answered with `setup:active` (answerer acts as DTLS client) or `setup:passive` (answerer acts as DTLS server).
   - If an Offer specifies `setup:active` and Answer specifies `setup:active`, DTLS negotiation fails immediately due to role conflict.
4. **Direction Compatibility**:
   - Offer `sendrecv` -> Answer `sendrecv`, `sendonly`, `recvonly`, or `inactive`.
   - Offer `sendonly` -> Answer `recvonly` or `inactive`.
   - Offer `recvonly` -> Answer `sendonly` or `inactive`.

---

## 3. STUN and TURN Protocol Engine

WebRTCLens includes a native binary implementation of RFC 5389 (STUN) and RFC 8656 / RFC 5766 (TURN).

### 3.1 Binary Message Header
Every STUN packet begins with a fixed 20-byte header:
```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|0 0|     STUN Message Type     |         Message Length        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         Magic Cookie                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|                     Transaction ID (96 bits)                  |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```
- **STUN Message Type**:
  - `0x0001`: Binding Request.
  - `0x0101`: Binding Success Response.
  - `0x0111`: Binding Error Response.
  - `0x0003`: Allocate Request (TURN).
  - `0x0103`: Allocate Success Response (TURN).
  - `0x0113`: Allocate Error Response (TURN).
- **Magic Cookie**: Fixed value `0x2112A442`.
- **Transaction ID**: 12 random bytes used to correlate request and response.

### 3.2 XOR-MAPPED-ADDRESS Decoding
To prevent NAT translation devices from modifying IP payloads, IPv4/IPv6 addresses are XOR-encrypted:
- `XOR Port` = `Wire Port` XOR `(Magic Cookie >> 16)`
- `XOR IPv4` = `Wire IPv4` XOR `Magic Cookie`
- `XOR IPv6` = `Wire IPv6` XOR `[Magic Cookie (32 bits) + Transaction ID (96 bits)]`

### 3.3 TURN Authentication Flow
1. Client sends initial `Allocate Request` without credentials.
2. Server responds with `401 Unauthorized` containing `REALM` and `NONCE` attributes.
3. Client computes credential key:
   $$\text{HA1} = \text{MD5}(\text{username} + ":" + \text{realm} + ":" + \text{password})$$
4. Client builds second `Allocate Request` containing:
   - `REQUESTED-TRANSPORT` (0x0019, UDP protocol number 17).
   - `LIFETIME` (0x000D, requested allocation duration in seconds).
   - `USERNAME` (0x0006).
   - `REALM` (0x0014).
   - `NONCE` (0x0015).
   - `MESSAGE-INTEGRITY` (0x0008, HMAC-SHA1 over the message using HA1).
   - `FINGERPRINT` (0x8028, CRC-32 XORed with 0x5354554e).

---

## 4. Interactive Candidate Priority & ICE Topology

Interactive Connectivity Establishment (RFC 8445 / RFC 5245) pairs local and remote candidates to evaluate network reachability.

### 4.1 Candidate Priority Formula
A candidate's priority is a 32-bit unsigned integer derived from:
$$\text{Priority} = (2^{24} \cdot \text{TypePref}) + (2^8 \cdot \text{LocalPref}) + (256 - \text{ComponentID})$$

Default Type Preferences:
- `host`: 126
- `prflx` (peer reflexive): 110
- `srflx` (server reflexive): 100
- `relay` (TURN relayed): 0

### 4.2 Candidate Pair Priority Formula
When the controlling agent pairs candidate $C$ with answering candidate $S$, the pair priority is:
$$\text{PairPriority} = 2^{32} \cdot \min(P_C, P_S) + 2 \cdot \max(P_C, P_S) + (P_C > P_S \,?\, 1 : 0)$$

WebRTCLens sorts all candidate combinations by pair priority, categorizes states (`frozen`, `waiting`, `in-progress`, `succeeded`, `failed`), and flags single point of failure bottlenecks.

---

## 5. Loopback & Network Chaos Simulation

To test how WebRTC behaves under adverse network conditions, WebRTCLens provides a dual peer connection loopback environment.

1. **Synthetic Video Generator**: Renders high-contrast SMPTE color bars, high precision millisecond counter, and an oscillating Lissajous trajectory to a 60 FPS HTML5 canvas, captured via `canvas.captureStream(30)`.
2. **Synthetic Audio Tone**: Uses the Web Audio API `AudioContext` with an `OscillatorNode` generating pure 440 Hz or sweep tones into a `MediaStreamDestination`.
3. **Chaos Engine**: Intercepts track constraints and RTCRtpSender parameters to simulate network jitter, forced packet drops, and bandwidth throttling.
4. **Stats Telemetry**: Polls `getStats()` at 1000ms intervals, calculating differences for bitrate (kbps), frame drop percentage, audio jitter (ms), and round trip time.
