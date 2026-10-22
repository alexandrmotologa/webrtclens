/**
 * WebRTCLens - STUN/TURN Binary Message Decoder (RFC 5389 & RFC 8656)
 */

import {
  STUN_MAGIC_COOKIE,
  STUN_HEADER_LENGTH,
  STUN_ATTRIBUTES,
  type DecodedStunMessage,
  type StunAddress,
  type StunErrorCode,
} from './protocol.js';

export function decodeStunMessage(buffer: Buffer): DecodedStunMessage {
  if (buffer.length < STUN_HEADER_LENGTH) {
    throw new Error(`Buffer too short for STUN packet: expected >= ${STUN_HEADER_LENGTH}, got ${buffer.length}`);
  }

  const type = buffer.readUInt16BE(0);
  const length = buffer.readUInt16BE(2);
  const magicCookie = buffer.readUInt32BE(4);
  const transactionId = buffer.subarray(8, 20);

  if (magicCookie !== STUN_MAGIC_COOKIE) {
    throw new Error(`Invalid STUN magic cookie: 0x${magicCookie.toString(16)} (expected 0x${STUN_MAGIC_COOKIE.toString(16)})`);
  }

  if (buffer.length < STUN_HEADER_LENGTH + length) {
    throw new Error(`Truncated STUN message: declared payload ${length} bytes, total buffer ${buffer.length}`);
  }

  const rawAttributes = new Map<number, Buffer>();
  let offset = STUN_HEADER_LENGTH;
  const end = STUN_HEADER_LENGTH + length;

  let mappedAddress: StunAddress | undefined;
  let xorMappedAddress: StunAddress | undefined;
  let xorRelayedAddress: StunAddress | undefined;
  let xorPeerAddress: StunAddress | undefined;
  let username: string | undefined;
  let realm: string | undefined;
  let nonce: string | undefined;
  let lifetime: number | undefined;
  let software: string | undefined;
  let errorCode: StunErrorCode | undefined;
  let hasMessageIntegrity = false;
  let hasFingerprint = false;

  while (offset + 4 <= end) {
    const attrType = buffer.readUInt16BE(offset);
    const attrLen = buffer.readUInt16BE(offset + 2);
    offset += 4;

    if (offset + attrLen > buffer.length) {
      break;
    }

    const attrVal = buffer.subarray(offset, offset + attrLen);
    rawAttributes.set(attrType, attrVal);

    switch (attrType) {
      case STUN_ATTRIBUTES.MAPPED_ADDRESS:
        mappedAddress = decodePlainAddress(attrVal);
        break;
      case STUN_ATTRIBUTES.XOR_MAPPED_ADDRESS:
        xorMappedAddress = decodeXorAddress(attrVal, transactionId);
        break;
      case STUN_ATTRIBUTES.XOR_RELAYED_ADDRESS:
        xorRelayedAddress = decodeXorAddress(attrVal, transactionId);
        break;
      case STUN_ATTRIBUTES.XOR_PEER_ADDRESS:
        xorPeerAddress = decodeXorAddress(attrVal, transactionId);
        break;
      case STUN_ATTRIBUTES.USERNAME:
        username = attrVal.toString('utf8');
        break;
      case STUN_ATTRIBUTES.REALM:
        realm = attrVal.toString('utf8');
        break;
      case STUN_ATTRIBUTES.NONCE:
        nonce = attrVal.toString('utf8');
        break;
      case STUN_ATTRIBUTES.SOFTWARE:
        software = attrVal.toString('utf8');
        break;
      case STUN_ATTRIBUTES.LIFETIME:
        if (attrVal.length >= 4) {
          lifetime = attrVal.readUInt32BE(0);
        }
        break;
      case STUN_ATTRIBUTES.ERROR_CODE:
        if (attrVal.length >= 4) {
          const errClass = attrVal.readUInt8(2) & 0x07;
          const errNumber = attrVal.readUInt8(3);
          const reason = attrVal.subarray(4).toString('utf8');
          errorCode = {
            code: errClass * 100 + errNumber,
            reason,
          };
        }
        break;
      case STUN_ATTRIBUTES.MESSAGE_INTEGRITY:
      case STUN_ATTRIBUTES.MESSAGE_INTEGRITY_SHA256:
        hasMessageIntegrity = true;
        break;
      case STUN_ATTRIBUTES.FINGERPRINT:
        hasFingerprint = true;
        break;
    }

    // Attributes are padded to 4-byte boundaries
    const padded = Math.ceil(attrLen / 4) * 4;
    offset += padded;
  }

  return {
    header: {
      type,
      length,
      magicCookie,
      transactionId,
    },
    mappedAddress,
    xorMappedAddress,
    xorRelayedAddress,
    xorPeerAddress,
    username,
    realm,
    nonce,
    lifetime,
    software,
    errorCode,
    hasMessageIntegrity,
    hasFingerprint,
    rawAttributes,
  };
}

function decodePlainAddress(buf: Buffer): StunAddress | undefined {
  if (buf.length < 8) return undefined;
  const familyByte = buf.readUInt8(1);
  const port = buf.readUInt16BE(2);

  if (familyByte === 0x01) {
    // IPv4
    const ip = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`;
    return { family: 'IPv4', port, address: ip };
  } else if (familyByte === 0x02 && buf.length >= 20) {
    // IPv6
    const parts: string[] = [];
    for (let i = 0; i < 8; i++) {
      parts.push(buf.readUInt16BE(4 + i * 2).toString(16));
    }
    return { family: 'IPv6', port, address: parts.join(':') };
  }
  return undefined;
}

function decodeXorAddress(buf: Buffer, transactionId: Buffer): StunAddress | undefined {
  if (buf.length < 8) return undefined;
  const familyByte = buf.readUInt8(1);
  const xorPort = buf.readUInt16BE(2);
  const port = xorPort ^ (STUN_MAGIC_COOKIE >>> 16);

  if (familyByte === 0x01) {
    // IPv4
    const xorIp = buf.readUInt32BE(4);
    const ipInt = (xorIp ^ STUN_MAGIC_COOKIE) >>> 0;
    const ip = `${(ipInt >>> 24) & 0xff}.${(ipInt >>> 16) & 0xff}.${(ipInt >>> 8) & 0xff}.${ipInt & 0xff}`;
    return { family: 'IPv4', port, address: ip };
  } else if (familyByte === 0x02 && buf.length >= 20) {
    // IPv6
    const xorKey = Buffer.concat([
      Buffer.from([0x21, 0x12, 0xa4, 0x42]),
      transactionId,
    ]);
    const ipBuf = Buffer.alloc(16);
    for (let i = 0; i < 16; i++) {
      ipBuf[i] = buf[4 + i] ^ xorKey[i];
    }
    const parts: string[] = [];
    for (let i = 0; i < 8; i++) {
      parts.push(ipBuf.readUInt16BE(i * 2).toString(16));
    }
    return { family: 'IPv6', port, address: parts.join(':') };
  }
  return undefined;
}
