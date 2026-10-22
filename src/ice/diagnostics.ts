/**
 * WebRTCLens - Rule-Based ICE Failure Diagnostics Engine
 */

import type { IceCandidate } from './candidate.js';
import type { CandidatePair } from './pair_matrix.js';

export interface DiagnosticIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  explanation: string;
  remediation: string;
}

export interface IceDiagnosticReport {
  healthScore: number; // 0 to 100
  status: 'healthy' | 'degraded' | 'critical';
  summary: string;
  issues: DiagnosticIssue[];
  candidateStats: {
    localCount: number;
    remoteCount: number;
    hasLocalHost: boolean;
    hasLocalSrflx: boolean;
    hasLocalRelay: boolean;
    hasRemoteHost: boolean;
    hasRemoteSrflx: boolean;
    hasRemoteRelay: boolean;
  };
}

export function diagnoseIceConnectivity(
  localCandidates: IceCandidate[],
  remoteCandidates: IceCandidate[],
  candidatePairs: CandidatePair[]
): IceDiagnosticReport {
  const issues: DiagnosticIssue[] = [];

  const hasLocalHost = localCandidates.some((c) => c.type === 'host');
  const hasLocalSrflx = localCandidates.some((c) => c.type === 'srflx');
  const hasLocalRelay = localCandidates.some((c) => c.type === 'relay');

  const hasRemoteHost = remoteCandidates.some((c) => c.type === 'host');
  const hasRemoteSrflx = remoteCandidates.some((c) => c.type === 'srflx');
  const hasRemoteRelay = remoteCandidates.some((c) => c.type === 'relay');

  // Rule 1: No Candidates
  if (localCandidates.length === 0 || remoteCandidates.length === 0) {
    issues.push({
      id: 'no_candidates',
      severity: 'critical',
      title: 'Missing ICE Candidates',
      explanation: 'One or both peers did not gather any ICE candidates before signaling concluded.',
      remediation: 'Verify that RTCPeerConnection gathering has started and candidates are added via addIceCandidate().',
    });
  }

  // Rule 2: Host-Only Candidates (No STUN / TURN)
  if (!hasLocalSrflx && !hasLocalRelay && (hasLocalHost || hasRemoteHost)) {
    issues.push({
      id: 'host_only',
      severity: 'warning',
      title: 'Host-Only Candidates Gathered',
      explanation: 'No server reflexive (STUN) or relayed (TURN) candidates were gathered by the local client.',
      remediation: 'Configure iceServers with valid STUN (e.g. stun:stun.l.google.com:19302) and TURN servers to support WAN traversal.',
    });
  }

  // Rule 3: mDNS Host Concealment
  const hasMdns = localCandidates.some((c) => c.ip.endsWith('.local'));
  if (hasMdns && !hasLocalSrflx && !hasLocalRelay) {
    issues.push({
      id: 'mdns_isolated',
      severity: 'critical',
      title: 'mDNS Host Candidate Isolation',
      explanation: 'Local candidate IP is masked with mDNS (.local) without STUN or TURN, making it unreachable outside the local broadcast domain.',
      remediation: 'Ensure STUN servers are configured in iceServers so the browser can discover its public reflexive IP address.',
    });
  }

  // Rule 4: No Relayed Candidate on Restricted Topologies
  if (!hasLocalRelay && !hasRemoteRelay) {
    issues.push({
      id: 'no_turn_server',
      severity: 'warning',
      title: 'No TURN Server Configured',
      explanation: 'Neither peer has allocated a relayed candidate. If either peer resides behind a Symmetric NAT or strict enterprise firewall, connection will fail.',
      remediation: 'Deploy a TURN server (RFC 8656) supporting UDP and TLS (port 5349) to guarantee fallback connectivity.',
    });
  }

  // Rule 5: Address Family Mismatch
  const localHasIpv4 = localCandidates.some((c) => !c.ip.includes(':'));
  const remoteHasIpv4 = remoteCandidates.some((c) => !c.ip.includes(':'));
  const localHasIpv6 = localCandidates.some((c) => c.ip.includes(':'));
  const remoteHasIpv6 = remoteCandidates.some((c) => c.ip.includes(':'));

  if ((localHasIpv4 && !localHasIpv6 && !remoteHasIpv4 && remoteHasIpv6) ||
      (!localHasIpv4 && localHasIpv6 && remoteHasIpv4 && !remoteHasIpv6)) {
    issues.push({
      id: 'ip_family_mismatch',
      severity: 'critical',
      title: 'IP Address Family Mismatch',
      explanation: 'One peer gathered exclusively IPv4 candidates while the other gathered exclusively IPv6 candidates without dual-stack relay.',
      remediation: 'Provide a dual-stack TURN server capable of bridging IPv4 and IPv6 traffic.',
    });
  }

  // Calculate Health Score
  let healthScore = 100;
  for (const issue of issues) {
    if (issue.severity === 'critical') healthScore -= 40;
    else if (issue.severity === 'warning') healthScore -= 15;
    else healthScore -= 5;
  }
  healthScore = Math.max(0, Math.min(healthScore, 100));

  let status: IceDiagnosticReport['status'] = 'healthy';
  let summary = 'ICE topology is well configured with robust fallback paths.';

  if (healthScore < 50) {
    status = 'critical';
    summary = 'Critical ICE configuration issues detected. Peer connectivity will fail in real network environments.';
  } else if (healthScore < 85) {
    status = 'degraded';
    summary = 'ICE candidate gathering is partially configured. Traversal may fail behind symmetric NATs or corporate firewalls.';
  }

  return {
    healthScore,
    status,
    summary,
    issues,
    candidateStats: {
      localCount: localCandidates.length,
      remoteCount: remoteCandidates.length,
      hasLocalHost,
      hasLocalSrflx,
      hasLocalRelay,
      hasRemoteHost,
      hasRemoteSrflx,
      hasRemoteRelay,
    },
  };
}
