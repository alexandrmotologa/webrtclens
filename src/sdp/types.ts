/**
 * WebRTCLens - SDP Types (RFC 8866 / RFC 4566)
 */

export type MediaType = 'audio' | 'video' | 'application' | 'data';
export type MediaDirection = 'sendrecv' | 'sendonly' | 'recvonly' | 'inactive';
export type DtlsRole = 'actpass' | 'active' | 'passive' | 'holdconn';

export interface CodecInfo {
  payloadType: number;
  name: string;
  clockRate: number;
  channels?: number;
  parameters?: Record<string, string>;
  rtcpFeedback?: string[];
}

export interface DtlsFingerprint {
  algorithm: string;
  hash: string;
}

export interface IceCredentials {
  ufrag?: string;
  pwd?: string;
  options?: string[];
}

export interface CandidateInfo {
  foundation: string;
  component: number;
  transport: 'udp' | 'tcp';
  priority: number;
  ip: string;
  port: number;
  type: 'host' | 'srflx' | 'prflx' | 'relay';
  raddr?: string;
  rport?: number;
  tcptype?: string;
  generation?: string;
  raw?: string;
}

export interface MediaSectionAST {
  mid?: string;
  type: MediaType;
  port: number;
  protocol: string;
  direction: MediaDirection;
  codecs: CodecInfo[];
  dtlsRole?: DtlsRole;
  fingerprints: DtlsFingerprint[];
  ice: IceCredentials;
  candidates: CandidateInfo[];
  rtcpMux: boolean;
  rtcpRsize: boolean;
  ssrcs?: Array<{ id: number; attribute: string; value: string }>;
  bandwidth?: { type: string; limit: number };
  raw: string;
}

export interface SessionDescriptionAST {
  version: number;
  origin: {
    username: string;
    sessionId: string;
    sessionVersion: string;
    netType: string;
    addrType: string;
    unicastAddress: string;
  };
  sessionName: string;
  timing: {
    start: number;
    stop: number;
  };
  connection?: {
    netType: string;
    addrType: string;
    ip: string;
  };
  bundleGroups: Array<{
    semantics: string;
    mids: string[];
  }>;
  media: MediaSectionAST[];
  raw: string;
}

export type DiffSeverity = 'info' | 'warning' | 'error';

export interface CodecMatch {
  name: string;
  offerPayloadType: number;
  answerPayloadType: number;
  clockRate: number;
  channels?: number;
  status: 'agreed' | 'rejected' | 'remapped';
  offerParams?: Record<string, string>;
  answerParams?: Record<string, string>;
  notes?: string;
}

export interface MediaDiffResult {
  mid: string;
  type: MediaType;
  status: 'negotiated' | 'rejected' | 'added_in_answer' | 'missing_in_answer';
  offerDirection?: MediaDirection;
  answerDirection?: MediaDirection;
  directionCompatible: boolean;
  dtlsOfferRole?: DtlsRole;
  dtlsAnswerRole?: DtlsRole;
  dtlsCompatible: boolean;
  codecs: CodecMatch[];
  commonCodecsCount: number;
  rtcpMuxNegotiated: boolean;
  bundled: boolean;
  diagnostics: Array<{
    severity: DiffSeverity;
    message: string;
    rfcRef?: string;
  }>;
}

export interface SdpDiffSummary {
  negotiable: boolean;
  totalOfferMedia: number;
  totalAnswerMedia: number;
  matchedMediaCount: number;
  rejectedMediaCount: number;
  bundleConfigured: boolean;
  dtlsCompatible: boolean;
  audioNegotiated: boolean;
  videoNegotiated: boolean;
  warningsCount: number;
  errorsCount: number;
}

export interface SdpDiffResult {
  summary: SdpDiffSummary;
  mediaDiffs: MediaDiffResult[];
  globalDiagnostics: Array<{
    severity: DiffSeverity;
    message: string;
    rfcRef?: string;
  }>;
}
