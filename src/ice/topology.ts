/**
 * WebRTCLens - ICE Network Topology Graph Generator
 */

import type { IceCandidate } from './candidate.js';
import type { CandidatePair } from './pair_matrix.js';

export interface TopologyNode {
  id: string;
  label: string;
  category: 'peer' | 'interface' | 'nat' | 'stun' | 'turn';
  side: 'local' | 'remote' | 'cloud';
  ip?: string;
  port?: number;
  highlighted?: boolean;
}

export interface TopologyEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  status: 'active' | 'candidate' | 'blocked';
  rttMs?: number;
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  traversalPath: 'direct_lan' | 'stun_p2p' | 'turn_relay' | 'disconnected';
  pathDescription: string;
}

export function generateTopologyGraph(
  localCandidates: IceCandidate[],
  remoteCandidates: IceCandidate[],
  nominatedPair?: CandidatePair
): TopologyGraph {
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];

  // Local Peer
  nodes.push({
    id: 'peer-local',
    label: 'Local WebRTC Client',
    category: 'peer',
    side: 'local',
  });

  // Remote Peer
  nodes.push({
    id: 'peer-remote',
    label: 'Remote WebRTC Peer',
    category: 'peer',
    side: 'remote',
  });

  const localHost = localCandidates.find((c) => c.type === 'host');
  const localSrflx = localCandidates.find((c) => c.type === 'srflx');
  const localRelay = localCandidates.find((c) => c.type === 'relay');

  const remoteHost = remoteCandidates.find((c) => c.type === 'host');
  const remoteSrflx = remoteCandidates.find((c) => c.type === 'srflx');
  const remoteRelay = remoteCandidates.find((c) => c.type === 'relay');

  if (localHost) {
    nodes.push({
      id: 'local-host',
      label: `Host Interface (${localHost.ip}:${localHost.port})`,
      category: 'interface',
      side: 'local',
      ip: localHost.ip,
      port: localHost.port,
    });
    edges.push({
      id: 'edge-local-to-host',
      from: 'peer-local',
      to: 'local-host',
      label: 'Local NIC',
      status: 'active',
    });
  }

  if (localSrflx) {
    nodes.push({
      id: 'local-nat',
      label: 'Local NAT / Firewall',
      category: 'nat',
      side: 'local',
    });
    nodes.push({
      id: 'stun-server',
      label: `STUN Server (${localSrflx.ip}:${localSrflx.port})`,
      category: 'stun',
      side: 'cloud',
      ip: localSrflx.ip,
      port: localSrflx.port,
    });
    edges.push({
      id: 'edge-host-to-nat',
      from: 'local-host',
      to: 'local-nat',
      label: 'Egress',
      status: 'candidate',
    });
    edges.push({
      id: 'edge-nat-to-stun',
      from: 'local-nat',
      to: 'stun-server',
      label: 'Binding Check',
      status: 'candidate',
    });
  }

  if (localRelay) {
    nodes.push({
      id: 'turn-server',
      label: `TURN Relay (${localRelay.ip}:${localRelay.port})`,
      category: 'turn',
      side: 'cloud',
      ip: localRelay.ip,
      port: localRelay.port,
    });
    edges.push({
      id: 'edge-local-to-turn',
      from: localSrflx ? 'local-nat' : 'local-host',
      to: 'turn-server',
      label: 'Allocated Port',
      status: 'candidate',
    });
  }

  if (remoteHost) {
    nodes.push({
      id: 'remote-host',
      label: `Remote Host (${remoteHost.ip}:${remoteHost.port})`,
      category: 'interface',
      side: 'remote',
      ip: remoteHost.ip,
      port: remoteHost.port,
    });
    edges.push({
      id: 'edge-remote-host-to-peer',
      from: 'remote-host',
      to: 'peer-remote',
      label: 'Inbound',
      status: 'active',
    });
  }

  // Determine nominated path
  let traversalPath: TopologyGraph['traversalPath'] = 'disconnected';
  let pathDescription = 'No connectivity candidates established between peers.';

  if (nominatedPair) {
    const lType = nominatedPair.local.type;
    const rType = nominatedPair.remote.type;

    if (lType === 'host' && rType === 'host') {
      traversalPath = 'direct_lan';
      pathDescription = 'Direct LAN / Localhost P2P path. Minimum latency, zero NAT translation.';
      edges.push({
        id: 'edge-active-p2p',
        from: 'local-host',
        to: 'remote-host',
        label: 'Direct Host-to-Host',
        status: 'active',
      });
    } else if (lType === 'relay' || rType === 'relay') {
      traversalPath = 'turn_relay';
      pathDescription = 'Relayed connection via TURN server. Traffic flows through intermediary relay proxy.';
      edges.push({
        id: 'edge-active-turn',
        from: 'turn-server',
        to: 'remote-host',
        label: 'Relayed Media Stream',
        status: 'active',
      });
    } else {
      traversalPath = 'stun_p2p';
      pathDescription = 'Direct WAN P2P path negotiated via STUN reflexive NAT punching.';
      edges.push({
        id: 'edge-active-srflx',
        from: 'local-nat',
        to: 'remote-host',
        label: 'P2P NAT Traversal',
        status: 'active',
      });
    }
  }

  return {
    nodes,
    edges,
    traversalPath,
    pathDescription,
  };
}
