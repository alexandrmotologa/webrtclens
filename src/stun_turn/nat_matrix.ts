/**
 * WebRTCLens - RFC 5780 NAT Traversal & Compatibility Matrix
 */

export type NatMappingType =
  | 'endpoint_independent' // Full Cone
  | 'address_dependent'     // Restricted Cone
  | 'port_dependent'        // Symmetric NAT
  | 'udp_blocked'           // Firewalled
  | 'open_internet';        // Public IP / No NAT

export interface NatCompatibilityCell {
  peerA: NatMappingType;
  peerB: NatMappingType;
  directP2pPossible: boolean;
  successProbabilityPercent: number;
  turnRequired: boolean;
  traversalMethod: 'Direct Host' | 'Direct STUN P2P' | 'Simultaneous Open Punching' | 'TURN Relay Mandatory' | 'TURN TLS Fallback';
  latencyOverheadMs: number;
  explanation: string;
}

export const NAT_COMPATIBILITY_MATRIX: NatCompatibilityCell[] = [
  // Open Internet
  {
    peerA: 'open_internet',
    peerB: 'open_internet',
    directP2pPossible: true,
    successProbabilityPercent: 100,
    turnRequired: false,
    traversalMethod: 'Direct Host',
    latencyOverheadMs: 0,
    explanation: 'Both peers have public IP addresses. Direct host-to-host UDP transmission with zero NAT translation.',
  },
  {
    peerA: 'open_internet',
    peerB: 'endpoint_independent',
    directP2pPossible: true,
    successProbabilityPercent: 100,
    turnRequired: false,
    traversalMethod: 'Direct STUN P2P',
    latencyOverheadMs: 1,
    explanation: 'Peer B endpoint-independent mapping allows Peer A to send media directly to Peer B reflexive address.',
  },
  {
    peerA: 'open_internet',
    peerB: 'port_dependent',
    directP2pPossible: true,
    successProbabilityPercent: 99,
    turnRequired: false,
    traversalMethod: 'Direct STUN P2P',
    latencyOverheadMs: 2,
    explanation: 'Peer B punches outbound to Peer A public IP. Peer A replies directly to the punched pinhole.',
  },

  // Endpoint Independent (Full Cone)
  {
    peerA: 'endpoint_independent',
    peerB: 'endpoint_independent',
    directP2pPossible: true,
    successProbabilityPercent: 100,
    turnRequired: false,
    traversalMethod: 'Direct STUN P2P',
    latencyOverheadMs: 2,
    explanation: 'Both NATs preserve the same external port for all destinations. Instant direct P2P hole punching.',
  },
  {
    peerA: 'endpoint_independent',
    peerB: 'address_dependent',
    directP2pPossible: true,
    successProbabilityPercent: 95,
    turnRequired: false,
    traversalMethod: 'Direct STUN P2P',
    latencyOverheadMs: 5,
    explanation: 'Standard STUN hole punching succeeds. Peer B allows traffic once it transmits an initial packet toward Peer A.',
  },
  {
    peerA: 'endpoint_independent',
    peerB: 'port_dependent',
    directP2pPossible: true,
    successProbabilityPercent: 90,
    turnRequired: false,
    traversalMethod: 'Direct STUN P2P',
    latencyOverheadMs: 8,
    explanation: 'Peer A full cone mapping accepts media from Peer B newly allocated symmetric port without filtering.',
  },

  // Address Dependent (Restricted Cone)
  {
    peerA: 'address_dependent',
    peerB: 'address_dependent',
    directP2pPossible: true,
    successProbabilityPercent: 82,
    turnRequired: false,
    traversalMethod: 'Simultaneous Open Punching',
    latencyOverheadMs: 12,
    explanation: 'Requires simultaneous ICE connectivity check packets from both endpoints to open symmetric stateful pinholes.',
  },
  {
    peerA: 'address_dependent',
    peerB: 'port_dependent',
    directP2pPossible: false,
    successProbabilityPercent: 35,
    turnRequired: true,
    traversalMethod: 'TURN Relay Mandatory',
    latencyOverheadMs: 25,
    explanation: 'Symmetric NAT changes external port per destination while restricted cone filters unknown ports. TURN relay required for reliable calls.',
  },

  // Port Dependent (Symmetric NAT)
  {
    peerA: 'port_dependent',
    peerB: 'port_dependent',
    directP2pPossible: false,
    successProbabilityPercent: 0,
    turnRequired: true,
    traversalMethod: 'TURN Relay Mandatory',
    latencyOverheadMs: 35,
    explanation: 'Both peers allocate brand new unpredictable external ports for each destination. Direct P2P hole punching is impossible (RFC 5389 §2).',
  },

  // UDP Blocked / Strict Firewall
  {
    peerA: 'udp_blocked',
    peerB: 'endpoint_independent',
    directP2pPossible: false,
    successProbabilityPercent: 0,
    turnRequired: true,
    traversalMethod: 'TURN TLS Fallback',
    latencyOverheadMs: 50,
    explanation: 'Outbound UDP is blocked by firewall policy. Media must be encapsulated over TURN TCP or TURN TLS (port 5349).',
  },
  {
    peerA: 'udp_blocked',
    peerB: 'port_dependent',
    directP2pPossible: false,
    successProbabilityPercent: 0,
    turnRequired: true,
    traversalMethod: 'TURN TLS Fallback',
    latencyOverheadMs: 60,
    explanation: 'Enterprise firewall blocking UDP combined with symmetric NAT. TURN over TLS strictly required.',
  },
];

export function evaluateNatPair(peerA: NatMappingType, peerB: NatMappingType): NatCompatibilityCell {
  const match = NAT_COMPATIBILITY_MATRIX.find(
    (c) => (c.peerA === peerA && c.peerB === peerB) || (c.peerA === peerB && c.peerB === peerA)
  );

  if (match) return match;

  // Fallback heuristic
  if (peerA === 'udp_blocked' || peerB === 'udp_blocked') {
    return {
      peerA,
      peerB,
      directP2pPossible: false,
      successProbabilityPercent: 0,
      turnRequired: true,
      traversalMethod: 'TURN TLS Fallback',
      latencyOverheadMs: 50,
      explanation: 'UDP blocked on one or both peers. Relayed TURN encapsulation mandatory.',
    };
  }

  if (peerA === 'port_dependent' && peerB === 'port_dependent') {
    return {
      peerA,
      peerB,
      directP2pPossible: false,
      successProbabilityPercent: 0,
      turnRequired: true,
      traversalMethod: 'TURN Relay Mandatory',
      latencyOverheadMs: 35,
      explanation: 'Symmetric-to-Symmetric NAT pair cannot establish direct connection.',
    };
  }

  return {
    peerA,
    peerB,
    directP2pPossible: true,
    successProbabilityPercent: 85,
    turnRequired: false,
    traversalMethod: 'Direct STUN P2P',
    latencyOverheadMs: 10,
    explanation: 'Cone NAT combination allows direct peer-to-peer media transmission.',
  };
}
