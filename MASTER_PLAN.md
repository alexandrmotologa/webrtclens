# WebRTCLens: Master Implementation Plan

> Interactive WebRTC Media and Signaling Workbench, SDP Diff Engine, STUN and TURN Protocol Tester, and ICE Topology Visualizer.

---

## 1. System Overview

WebRTC applications require coordination across signaling (SDP), NAT traversal (STUN/TURN), peer connectivity (ICE), and real-time transport (RTP/RTCP). When connections degrade or fail, diagnosing the root cause is difficult due to cryptic SDP text formats, opaque ICE state transitions, and unverified TURN server configurations.

WebRTCLens provides an integrated protocol inspector, testing harness, and diagnostic studio:
- **Semantic SDP Diff**: Parses Session Description Protocol offers and answers into typed Abstract Syntax Trees (ASTs). Pinpoints codec negotiations, payload type mappings, DTLS fingerprint agreements, media directions, and BUNDLE multiplexing.
- **STUN and TURN Protocol Probe**: Sends raw binary RFC 5389 Binding and RFC 8656 Allocation packets over UDP, TCP, and TLS. Measures Round Trip Time (RTT), parses `XOR-MAPPED-ADDRESS`, handles 401 challenges with MD5 credential hashing, and confirms relay port allocation (`XOR-RELAYED-ADDRESS`).
- **ICE Waterfall and Topology Visualizer**: Traces the candidate gathering lifecycle (`host`, `srflx`, `prflx`, `relay`), evaluates RFC 5245 candidate pair priorities, and maps the network traversal topology.
- **Synthetic Loopback and Network Chaos Studio**: Runs an in-browser WebRTC loopback using synthetic canvas video and Web Audio tones, applying configurable packet loss, artificial delay, and jitter while collecting real-time `RTCStatsReport` metrics.
- **CLI and HTTP Server**: Command-line tool (`webrtclens diff`, `webrtclens probe`, `webrtclens serve`) paired with a Fastify REST API and a React 19 web application.

```
+-----------------------------------------------------------------------------------+
|                                    WEBRTCLENS                                     |
+-----------------------------------------+-----------------------------------------+
                                          |
        +---------------------------------+---------------------------------+
        |                                                                   |
+-------v-------------------------+                 +-----------------------v-------+
|      SDP Visual Diff Engine     |                 |    STUN / TURN Benchmark      |
|  * RFC 8866 / 4566 AST Parser   |                 |  * STUN Binding Request (5389)|
|  * Codec Matching (VP8/Opus/AV1)|                 |  * TURN Allocation (UDP/TLS)  |
|  * DTLS Fingerprint & Setup     |                 |  * RTT & XOR-MAPPED-ADDRESS   |
+-------+-------------------------+                 +-----------------------+-------+
        |                                                                   |
        +---------------------------------+---------------------------------+
                                          |
                        +-----------------v-----------------+
                        |    ICE Candidate Topology Engine  |
                        |  * Host, Srflx, Prflx, Relay      |
                        |  * Candidate Pair Priority Matrix |
                        |  * Connection Timeout Diagnostics |
                        +-----------------+-----------------+
                                          |
                        +-----------------v-----------------+
                        |   Loopback Chaos & Video Harness  |
                        |  * Synthetic Video & Audio Source |
                        |  * Packet Drop & Jitter Injection |
                        |  * Live RTCStats Visualizer       |
                        +-----------------+-----------------+
                                          |
                        +-----------------v-----------------+
                        |   Interactive Web Studio & CLI    |
                        |  * Side-by-Side SDP Diff Cards    |
                        |  * ICE Gathering Waterfall        |
                        |  * 1-Click TURN Diagnostic Report |
                        +-----------------------------------+
```

---

## 2. Technical Stack and Architecture

- **Backend Runtime**: Node.js 22+ (native fetch, crypto, `node:dgram`, `node:net`, `node:tls`).
- **Signaling and Parsing**: `sdp-transform` combined with custom RFC 8866 semantic diff engine.
- **HTTP and API Server**: Fastify 5.x with CORS and static file serving.
- **Frontend Framework**: React 19, TypeScript, Tailwind CSS, Lucide React, and Vite.
- **CLI Framework**: Commander.js with terminal color formatting.
- **Test Framework**: Node.js native test runner (`node:test`) with local mock STUN/TURN responders.

---

## 3. Directory Layout

```
webrtclens/
├── bin/
│   └── webrtclens.js             # Executable CLI launcher
├── src/
│   ├── sdp/
│   │   ├── types.ts              # Typed AST definitions for RFC 8866 SDP
│   │   ├── parser.ts             # Parser and normalizer for SDP text
│   │   ├── diff.ts               # Semantic diff engine for Offer vs Answer
│   │   ├── codecs.ts             # Audio and video codec database
│   │   ├── samples.ts            # Pre-configured real-world SDP scenarios
│   │   └── formatter.ts          # RFC attribute documentation and lookup
│   ├── stun_turn/
│   │   ├── protocol.ts           # Binary packet constants, types, and attributes
│   │   ├── encoder.ts            # Binary encoder for STUN/TURN messages
│   │   ├── decoder.ts            # Binary decoder for attributes and addresses
│   │   ├── stun_client.ts        # UDP and TCP STUN binding client
│   │   ├── turn_client.ts        # UDP, TCP, and TLS TURN allocation client
│   │   └── benchmark.ts          # Latency, packet loss, and jitter benchmark
│   ├── ice/
│   │   ├── candidate.ts          # Candidate parser and serializer
│   │   ├── gathering.ts          # Gathering state machine and waterfall events
│   │   ├── pair_matrix.ts        # RFC 5245 pair priority and state tracker
│   │   ├── topology.ts           # Visual graph topology generator
│   │   └── diagnostics.ts        # Rule-based ICE failure diagnostics
│   ├── loopback/
│   │   ├── synthetic_media.ts    # Canvas pattern and audio tone generator math
│   │   ├── chaos_injector.ts     # Configurable packet loss and jitter simulation
│   │   └── stats_tracker.ts      # RTCStats delta calculation and telemetry
│   ├── server/
│   │   ├── app.ts                # Fastify server instance and routes
│   │   ├── routes_sdp.ts         # SDP parsing and diff endpoints
│   │   ├── routes_probe.ts       # STUN and TURN probe endpoints
│   │   └── routes_samples.ts     # Sample scenario catalog endpoints
│   └── cli.ts                    # Commander CLI entrypoint
├── web/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── components/
│       │   ├── Navbar.tsx            # Navigation header and active tab indicator
│       │   ├── SdpDiffStudio.tsx     # Interactive side-by-side SDP diff
│       │   ├── StunTurnProbeHub.tsx  # STUN/TURN tester with logs and RTT display
│       │   ├── IceWaterfallView.tsx  # Candidate timeline and priority matrix
│       │   ├── MediaLoopbackView.tsx # WebRTC loopback with chaos controls
│       │   └── RfcReferenceView.tsx  # Searchable WebRTC RFC attribute guide
│       └── hooks/
│           ├── useWebRtcLoopback.ts  # Hook managing dual RTCPeerConnections
│           └── useStatsCollector.ts  # Hook streaming live RTCStatsReport
├── tests/
│   ├── sdp.test.ts               # Unit tests for SDP parser and diff engine
│   ├── stun.test.ts              # Unit tests for binary STUN encoding and decoding
│   ├── turn.test.ts              # Unit tests for TURN authentication and allocation
│   ├── ice.test.ts               # Unit tests for candidate priority and diagnostics
│   └── helpers/
│       └── mock_stun_server.ts   # Local UDP responder for deterministic testing
├── docs/
│   ├── images/                   # Screenshots and demo recording
│   └── ARCHITECTURE.md           # Deep dive into protocols and implementation
├── package.json
├── tsconfig.json
└── README.md
```

---

## 4. Detailed Task Breakdown

### Phase 1: Repository Setup and Documentation Foundations
- [x] Task 1.1: Create public GitHub repository `alexandrmotologa/webrtclens` with 15 targeted topics.
- [x] Task 1.2: Register project in `mtlg-site` and `mtlglabs-space` portfolios with active development status.
- [x] Task 1.3: Initialize local git repository, commit history, and remote tracking.
- [x] Task 1.4: Scaffold root `package.json`, `tsconfig.json`, and development dependencies.
- [x] Task 1.5: Draft humanized `README.md` and `docs/ARCHITECTURE.md`.

### Phase 2: SDP Abstract Syntax Tree and Semantic Diff Engine
- [x] Task 2.1: Implement typed AST definitions in `src/sdp/types.ts`.
- [x] Task 2.2: Implement RFC 8866 SDP parser and normalizer in `src/sdp/parser.ts`.
- [x] Task 2.3: Build codec registry and parameter lookup table in `src/sdp/codecs.ts`.
- [x] Task 2.4: Implement semantic Offer vs Answer comparison in `src/sdp/diff.ts` (codecs, DTLS, ICE, BUNDLE, media directions).
- [x] Task 2.5: Curate comprehensive real-world SDP sample scenarios in `src/sdp/samples.ts`.
- [x] Task 2.6: Write automated tests in `tests/sdp.test.ts`.

### Phase 3: Binary STUN and TURN Protocol Engine
- [x] Task 3.1: Define RFC 5389 and RFC 8656 constants, headers, and attribute codes in `src/stun_turn/protocol.ts`.
- [x] Task 3.2: Implement binary message builder with HMAC-SHA1 and CRC-32 in `src/stun_turn/encoder.ts`.
- [x] Task 3.3: Implement binary response parser with XOR address decoding in `src/stun_turn/decoder.ts`.
- [x] Task 3.4: Build UDP and TCP STUN binding client in `src/stun_turn/stun_client.ts`.
- [x] Task 3.5: Build RFC 8656 TURN allocation client (UDP, TCP, TLS) with 401 challenge and MD5 credential hashing in `src/stun_turn/turn_client.ts`.
- [x] Task 3.6: Implement latency, packet loss, and jitter benchmark runner in `src/stun_turn/benchmark.ts`.
- [x] Task 3.7: Implement in-memory mock STUN/TURN UDP server and comprehensive tests in `tests/stun.test.ts` and `tests/turn.test.ts`.

### Phase 4: ICE Gathering, Pair Priority, and Topology Engine
- [x] Task 4.1: Implement candidate parser, serializer, and classifier in `src/ice/candidate.ts`.
- [x] Task 4.2: Implement gathering state machine and waterfall event collector in `src/ice/gathering.ts`.
- [x] Task 4.3: Implement RFC 5245 candidate pair priority calculation in `src/ice/pair_matrix.ts`.
- [x] Task 4.4: Implement rule-based ICE failure diagnostics in `src/ice/diagnostics.ts`.
- [x] Task 4.5: Generate structured network topology graph in `src/ice/topology.ts`.
- [x] Task 4.6: Write automated tests in `tests/ice.test.ts`.

### Phase 5: Fastify API Server and Command-Line Interface
- [x] Task 5.1: Scaffold Fastify server in `src/server/app.ts` with CORS and error handling.
- [x] Task 5.2: Create REST endpoints for SDP parsing, diffing, and sample catalog.
- [x] Task 5.3: Create REST endpoints for STUN/TURN probing and benchmark runs.
- [x] Task 5.4: Implement Commander CLI in `src/cli.ts` (`diff`, `probe`, `serve`).
- [x] Task 5.5: Configure executable binary entrypoint in `bin/webrtclens.js`.

### Phase 6: Modern React 19 Web Studio
- [x] Task 6.1: Initialize Vite React 19 app in `web/` with Tailwind CSS and Lucide icons.
- [x] Task 6.2: Build interactive navigation app shell with dark terminal cockpit styling.
- [x] Task 6.3: Implement SDP Diff Studio with side-by-side editing, syntax highlighting, and visual match badges.
- [x] Task 6.4: Implement STUN/TURN Probe Hub with presets (Google, Cloudflare, Twilio, Coturn), live log stream, and RTT gauge.
- [x] Task 6.5: Implement ICE Waterfall and Topology Visualizer with interactive Gantt-style timeline and pair matrix.
- [x] Task 6.6: Implement Media Loopback and Chaos Studio with canvas test pattern, audio oscillator, chaos sliders, and live SVG charts.
- [x] Task 6.7: Implement searchable RFC Reference View for SDP and STUN/TURN attributes.
- [x] Task 6.8: Connect web frontend build to Fastify static serving.

### Phase 7: Verification, Visual Assets, and Final Delivery
- [x] Task 7.1: Run full test suite across all modules (SDP, STUN, TURN, ICE, API, CLI).
- [x] Task 7.2: Capture high-fidelity screenshots of the running application and generate animated demo GIF (`docs/images/webrtclens_demo.gif`).
- [x] Task 7.3: Synchronize screenshots and demo GIF to `mtlg-site` and `mtlglabs-space`, set status to LIVE, recompile and push.
- [x] Task 7.4: Publish launch broadcast preview and announcement via `broadcast_x.js`.
