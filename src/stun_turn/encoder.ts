/**
 * WebRTCLens - STUN/TURN Binary Message Encoder (RFC 5389 & RFC 8656)
 */

import { randomBytes, createHmac } from 'node:crypto';
import {
  STUN_MAGIC_COOKIE,
  STUN_HEADER_LENGTH,
  STUN_ATTRIBUTES,
} from './protocol.js';

// Table for standard IEEE 802.3 CRC32
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

export function computeCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface EncodeAttribute {
  type: number;
  value: Buffer;
}

export interface EncodeStunOptions {
  type: number;
  transactionId?: Buffer;
  attributes?: EncodeAttribute[];
  integrityKey?: Buffer | string;
  addFingerprint?: boolean;
}

export function encodeStunMessage(options: EncodeStunOptions): Buffer {
  const transactionId = options.transactionId || randomBytes(12);
  if (transactionId.length !== 12) {
    throw new Error('STUN Transaction ID must be exactly 12 bytes');
  }

  const rawAttributes: Buffer[] = [];
  let totalAttrLength = 0;

  if (options.attributes) {
    for (const attr of options.attributes) {
      const paddedLength = Math.ceil(attr.value.length / 4) * 4;
      const padding = paddedLength - attr.value.length;

      const attrBuf = Buffer.alloc(4 + paddedLength);
      attrBuf.writeUInt16BE(attr.type, 0);
      attrBuf.writeUInt16BE(attr.value.length, 2);
      attr.value.copy(attrBuf, 4);

      if (padding > 0) {
        attrBuf.fill(0, 4 + attr.value.length, 4 + paddedLength);
      }

      rawAttributes.push(attrBuf);
      totalAttrLength += attrBuf.length;
    }
  }

  // Handle MESSAGE-INTEGRITY if requested
  if (options.integrityKey) {
    // 4 bytes header + 20 bytes HMAC-SHA1 = 24 bytes
    const integrityLength = 24;
    const msgLengthForHmac = totalAttrLength + integrityLength;

    const tempHeader = Buffer.alloc(STUN_HEADER_LENGTH);
    tempHeader.writeUInt16BE(options.type, 0);
    tempHeader.writeUInt16BE(msgLengthForHmac, 2);
    tempHeader.writeUInt32BE(STUN_MAGIC_COOKIE, 4);
    transactionId.copy(tempHeader, 8);

    const bodyForHmac = Buffer.concat([tempHeader, ...rawAttributes]);
    const hmac = createHmac('sha1', options.integrityKey).update(bodyForHmac).digest();

    const integrityAttr = Buffer.alloc(4 + 20);
    integrityAttr.writeUInt16BE(STUN_ATTRIBUTES.MESSAGE_INTEGRITY, 0);
    integrityAttr.writeUInt16BE(20, 2);
    hmac.copy(integrityAttr, 4);

    rawAttributes.push(integrityAttr);
    totalAttrLength += integrityAttr.length;
  }

  // Handle FINGERPRINT if requested
  if (options.addFingerprint) {
    // 4 bytes header + 4 bytes CRC = 8 bytes
    const fingerprintLength = 8;
    const msgLengthWithFingerprint = totalAttrLength + fingerprintLength;

    const tempHeader = Buffer.alloc(STUN_HEADER_LENGTH);
    tempHeader.writeUInt16BE(options.type, 0);
    tempHeader.writeUInt16BE(msgLengthWithFingerprint, 2);
    tempHeader.writeUInt32BE(STUN_MAGIC_COOKIE, 4);
    transactionId.copy(tempHeader, 8);

    const bodyForCrc = Buffer.concat([tempHeader, ...rawAttributes]);
    const crc = computeCrc32(bodyForCrc) ^ 0x5354554e;

    const fpAttr = Buffer.alloc(8);
    fpAttr.writeUInt16BE(STUN_ATTRIBUTES.FINGERPRINT, 0);
    fpAttr.writeUInt16BE(4, 2);
    fpAttr.writeUInt32BE(crc >>> 0, 4);

    rawAttributes.push(fpAttr);
    totalAttrLength += fpAttr.length;
  }

  // Final Header
  const header = Buffer.alloc(STUN_HEADER_LENGTH);
  header.writeUInt16BE(options.type, 0);
  header.writeUInt16BE(totalAttrLength, 2);
  header.writeUInt32BE(STUN_MAGIC_COOKIE, 4);
  transactionId.copy(header, 8);

  return Buffer.concat([header, ...rawAttributes]);
}

// Helper encoders for common attributes
export function createStringAttribute(type: number, value: string): EncodeAttribute {
  return {
    type,
    value: Buffer.from(value, 'utf8'),
  };
}

export function createRequestedTransportAttribute(protocol = 17): EncodeAttribute {
  // Protocol 17 = UDP
  const buf = Buffer.alloc(4);
  buf.writeUInt8(protocol, 0);
  return {
    type: STUN_ATTRIBUTES.REQUESTED_TRANSPORT,
    value: buf,
  };
}

export function createLifetimeAttribute(seconds = 600): EncodeAttribute {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(seconds, 0);
  return {
    type: STUN_ATTRIBUTES.LIFETIME,
    value: buf,
  };
}

export function createXorAddressAttribute(
  type: number,
  ip: string,
  port: number,
  transactionId: Buffer
): EncodeAttribute {
  const isIpv6 = ip.includes(':');
  if (isIpv6) {
    const buf = Buffer.alloc(20);
    buf.writeUInt8(0, 0);
    buf.writeUInt8(0x02, 1); // IPv6 family
    buf.writeUInt16BE(port ^ (STUN_MAGIC_COOKIE >>> 16), 2);

    // XOR IPv6 address
    const xorKey = Buffer.concat([
      Buffer.from([0x21, 0x12, 0xa4, 0x42]),
      transactionId,
    ]);
    const ipParts = ip.split(':').map((p) => parseInt(p || '0', 16));
    const ipBuf = Buffer.alloc(16);
    for (let i = 0; i < 8; i++) {
      ipBuf.writeUInt16BE(ipParts[i] || 0, i * 2);
    }
    for (let i = 0; i < 16; i++) {
      buf[4 + i] = ipBuf[i] ^ xorKey[i];
    }
    return { type, value: buf };
  } else {
    const buf = Buffer.alloc(8);
    buf.writeUInt8(0, 0);
    buf.writeUInt8(0x01, 1); // IPv4 family
    buf.writeUInt16BE(port ^ (STUN_MAGIC_COOKIE >>> 16), 2);

    const octets = ip.split('.').map(Number);
    const ipInt =
      ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
    buf.writeUInt32BE((ipInt ^ STUN_MAGIC_COOKIE) >>> 0, 4);

    return { type, value: buf };
  }
}
