/**
 * WebRTCLens - STUN (RFC 5389) and TURN (RFC 8656) Protocol Definitions
 */

export const STUN_MAGIC_COOKIE = 0x2112a442;
export const STUN_HEADER_LENGTH = 20;

// Message Types
export const STUN_MESSAGE_TYPES = {
  BINDING_REQUEST: 0x0001,
  BINDING_RESPONSE: 0x0101,
  BINDING_ERROR_RESPONSE: 0x0111,

  ALLOCATE_REQUEST: 0x0003,
  ALLOCATE_RESPONSE: 0x0103,
  ALLOCATE_ERROR_RESPONSE: 0x0113,

  REFRESH_REQUEST: 0x0004,
  REFRESH_RESPONSE: 0x0104,
  REFRESH_ERROR_RESPONSE: 0x0114,

  CREATE_PERMISSION_REQUEST: 0x0008,
  CREATE_PERMISSION_RESPONSE: 0x0108,
  CREATE_PERMISSION_ERROR_RESPONSE: 0x0118,

  CHANNEL_BIND_REQUEST: 0x0009,
  CHANNEL_BIND_RESPONSE: 0x0109,
  CHANNEL_BIND_ERROR_RESPONSE: 0x0119,

  SEND_INDICATION: 0x0016,
  DATA_INDICATION: 0x0017,
} as const;

// Attributes
export const STUN_ATTRIBUTES = {
  MAPPED_ADDRESS: 0x0001,
  USERNAME: 0x0006,
  MESSAGE_INTEGRITY: 0x0008,
  ERROR_CODE: 0x0009,
  UNKNOWN_ATTRIBUTES: 0x000a,
  REALM: 0x0014,
  NONCE: 0x0015,
  XOR_MAPPED_ADDRESS: 0x0020,
  SOFTWARE: 0x8022,
  ALTERNATE_SERVER: 0x8023,
  FINGERPRINT: 0x8028,

  // TURN Specific Attributes (RFC 8656)
  CHANNEL_NUMBER: 0x000c,
  LIFETIME: 0x000d,
  XOR_PEER_ADDRESS: 0x0012,
  DATA: 0x0013,
  XOR_RELAYED_ADDRESS: 0x0016,
  EVEN_PORT: 0x0018,
  REQUESTED_TRANSPORT: 0x0019,
  DONT_FRAG: 0x001a,
  MESSAGE_INTEGRITY_SHA256: 0x001c,
  PASSWORD_ALGORITHM: 0x001d,
  USERHASH: 0x001e,
} as const;

export interface StunHeader {
  type: number;
  length: number;
  magicCookie: number;
  transactionId: Buffer;
}

export interface StunAddress {
  family: 'IPv4' | 'IPv6';
  port: number;
  address: string;
}

export interface StunErrorCode {
  code: number;
  reason: string;
}

export interface DecodedStunMessage {
  header: StunHeader;
  mappedAddress?: StunAddress;
  xorMappedAddress?: StunAddress;
  xorRelayedAddress?: StunAddress;
  xorPeerAddress?: StunAddress;
  username?: string;
  realm?: string;
  nonce?: string;
  lifetime?: number;
  software?: string;
  errorCode?: StunErrorCode;
  hasMessageIntegrity: boolean;
  hasFingerprint: boolean;
  rawAttributes: Map<number, Buffer>;
}
