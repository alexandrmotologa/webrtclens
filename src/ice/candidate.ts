/**
 * WebRTCLens - ICE Candidate Parser and Serializer (RFC 8445 & RFC 5245)
 */

export type CandidateType = 'host' | 'srflx' | 'prflx' | 'relay';
export type TransportType = 'udp' | 'tcp';
export type TcpType = 'active' | 'passive' | 'so';

export interface IceCandidate {
  foundation: string;
  component: number; // 1 = RTP, 2 = RTCP
  transport: TransportType;
  priority: number;
  ip: string;
  port: number;
  type: CandidateType;
  raddr?: string;
  rport?: number;
  tcptype?: TcpType;
  generation?: string;
  networkId?: string;
  networkCost?: number;
  raw: string;
}

// RFC 5245 recommended type preferences
export const TYPE_PREFERENCES: Record<CandidateType, number> = {
  host: 126,
  prflx: 110,
  srflx: 100,
  relay: 0,
};

/**
 * Calculates RFC 5245 candidate priority
 * Priority = (2^24 * type_pref) + (2^8 * local_pref) + (256 - component_id)
 */
export function computeCandidatePriority(
  type: CandidateType,
  localPref = 65535,
  componentId = 1
): number {
  const typePref = TYPE_PREFERENCES[type] ?? 0;
  const clampedLocalPref = Math.max(0, Math.min(localPref, 65535));
  const clampedComponent = Math.max(1, Math.min(componentId, 256));

  return (
    ((typePref & 0xff) << 24) |
    ((clampedLocalPref & 0xffff) << 8) |
    ((256 - clampedComponent) & 0xff)
  ) >>> 0;
}

/**
 * Parses an SDP candidate attribute line into a typed IceCandidate object
 * Example: candidate:4234997325 1 udp 2113937151 192.168.1.100 50000 typ host
 */
export function parseCandidate(candidateLine: string): IceCandidate {
  let cleaned = candidateLine.trim();
  if (cleaned.startsWith('a=')) {
    cleaned = cleaned.slice(2);
  }
  if (cleaned.startsWith('candidate:')) {
    cleaned = cleaned.slice(10);
  }

  const parts = cleaned.split(/\s+/);
  if (parts.length < 8) {
    throw new Error(`Invalid candidate line: expected at least 8 tokens, got ${parts.length}`);
  }

  const foundation = parts[0];
  const component = parseInt(parts[1], 10);
  const transport = parts[2].toLowerCase() as TransportType;
  const priority = parseInt(parts[3], 10);
  const ip = parts[4];
  const port = parseInt(parts[5], 10);

  if (parts[6] !== 'typ') {
    throw new Error(`Invalid candidate format: expected 'typ' token at index 6, got '${parts[6]}'`);
  }

  const type = parts[7].toLowerCase() as CandidateType;

  let raddr: string | undefined;
  let rport: number | undefined;
  let tcptype: TcpType | undefined;
  let generation: string | undefined;
  let networkId: string | undefined;
  let networkCost: number | undefined;

  for (let i = 8; i < parts.length; i += 2) {
    const key = parts[i];
    const val = parts[i + 1];
    if (!val) break;

    if (key === 'raddr') raddr = val;
    else if (key === 'rport') rport = parseInt(val, 10);
    else if (key === 'tcptype') tcptype = val.toLowerCase() as TcpType;
    else if (key === 'generation') generation = val;
    else if (key === 'network-id') networkId = val;
    else if (key === 'network-cost') networkCost = parseInt(val, 10);
  }

  return {
    foundation,
    component,
    transport,
    priority,
    ip,
    port,
    type,
    raddr,
    rport,
    tcptype,
    generation,
    networkId,
    networkCost,
    raw: candidateLine,
  };
}

export function formatCandidate(c: IceCandidate): string {
  let str = `candidate:${c.foundation} ${c.component} ${c.transport.toUpperCase()} ${c.priority} ${c.ip} ${c.port} typ ${c.type}`;
  if (c.raddr && c.rport) {
    str += ` raddr ${c.raddr} rport ${c.rport}`;
  }
  if (c.tcptype) {
    str += ` tcptype ${c.tcptype}`;
  }
  if (c.generation) {
    str += ` generation ${c.generation}`;
  }
  return str;
}
