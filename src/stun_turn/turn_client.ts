/**
 * WebRTCLens - TURN Allocation & Authentication Client (RFC 8656 & RFC 5766)
 */

import dgram from 'node:dgram';
import net from 'node:net';
import tls from 'node:tls';
import { createHash, randomBytes } from 'node:crypto';
import {
  STUN_MESSAGE_TYPES,
  STUN_ATTRIBUTES,
  type StunAddress,
} from './protocol.js';
import {
  encodeStunMessage,
  createRequestedTransportAttribute,
  createLifetimeAttribute,
  createStringAttribute,
} from './encoder.js';
import { decodeStunMessage } from './decoder.js';

export interface TurnCredentials {
  username: string;
  credential: string; // password or auth secret
  realm?: string;
}

export interface TurnProbeOptions {
  host: string;
  port?: number;
  transport?: 'udp' | 'tcp' | 'tls';
  credentials?: TurnCredentials;
  timeoutMs?: number;
}

export interface TurnProbeResult {
  host: string;
  port: number;
  transport: 'udp' | 'tcp' | 'tls';
  rttMs: number;
  success: boolean;
  relayedAddress?: StunAddress;
  mappedAddress?: StunAddress;
  lifetime?: number;
  realm?: string;
  software?: string;
  error?: string;
  stageReached: 'unauthorized_probe' | 'authenticated_allocation' | 'failed';
}

export function computeTurnKey(username: string, realm: string, password: string): Buffer {
  const str = `${username}:${realm}:${password}`;
  return createHash('md5').update(str, 'utf8').digest();
}

export function parseTurnUrl(rawUrl: string): {
  host: string;
  port: number;
  transport: 'udp' | 'tcp' | 'tls';
} {
  let cleaned = rawUrl.trim();
  let defaultTransport: 'udp' | 'tcp' | 'tls' = 'udp';
  let defaultPort = 3478;

  if (cleaned.startsWith('turns:')) {
    defaultTransport = 'tls';
    defaultPort = 5349;
    cleaned = cleaned.slice(6);
  } else if (cleaned.startsWith('turn:')) {
    cleaned = cleaned.slice(5);
  }

  const paramIdx = cleaned.indexOf('?');
  if (paramIdx !== -1) {
    const params = new URLSearchParams(cleaned.slice(paramIdx + 1));
    const t = params.get('transport')?.toLowerCase();
    if (t === 'tcp') defaultTransport = 'tcp';
    if (t === 'tls') defaultTransport = 'tls';
    cleaned = cleaned.slice(0, paramIdx);
  }

  let host = cleaned;
  let port = defaultPort;

  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    host = parts[0];
    port = parseInt(parts[1], 10) || defaultPort;
  }

  return { host, port, transport: defaultTransport };
}

export async function probeTurn(options: TurnProbeOptions): Promise<TurnProbeResult> {
  const host = options.host;
  const transport = options.transport || 'udp';
  const defaultPort = transport === 'tls' ? 5349 : 3478;
  const port = options.port || defaultPort;
  const timeoutMs = options.timeoutMs || 4000;

  if (transport === 'udp') {
    return probeTurnUdp(host, port, options.credentials, timeoutMs);
  } else if (transport === 'tcp') {
    return probeTurnStream(host, port, false, options.credentials, timeoutMs);
  } else {
    return probeTurnStream(host, port, true, options.credentials, timeoutMs);
  }
}

function probeTurnUdp(
  host: string,
  port: number,
  creds: TurnCredentials | undefined,
  timeoutMs: number
): Promise<TurnProbeResult> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    let transactionId = randomBytes(12);
    let stage: 'initial' | 'challenged' = 'initial';
    let realm = creds?.realm;
    let nonce: string | undefined;

    const startTime = performance.now();
    let isSettled = false;

    const timer = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve({
        host,
        port,
        transport: 'udp',
        rttMs: timeoutMs,
        success: false,
        error: `TURN UDP allocation timed out after ${timeoutMs}ms`,
        stageReached: 'failed',
      });
    }, timeoutMs);

    const sendInitialAllocate = () => {
      const pkt = encodeStunMessage({
        type: STUN_MESSAGE_TYPES.ALLOCATE_REQUEST,
        transactionId,
        attributes: [
          createRequestedTransportAttribute(17), // UDP
          createLifetimeAttribute(600),
        ],
        addFingerprint: true,
      });

      socket.send(pkt, port, host);
    };

    const sendAuthenticatedAllocate = (r: string, n: string) => {
      if (!creds || !creds.username || !creds.credential) {
        clearTimeout(timer);
        isSettled = true;
        try {
          socket.close();
        } catch {
          // ignore
        }
        resolve({
          host,
          port,
          transport: 'udp',
          rttMs: Math.round(performance.now() - startTime),
          success: false,
          realm: r,
          error: `TURN server responded with 401 challenge (Realm: ${r}), but no credentials were provided`,
          stageReached: 'unauthorized_probe',
        });
        return;
      }

      const key = computeTurnKey(creds.username, r, creds.credential);
      transactionId = randomBytes(12);

      const pkt = encodeStunMessage({
        type: STUN_MESSAGE_TYPES.ALLOCATE_REQUEST,
        transactionId,
        attributes: [
          createRequestedTransportAttribute(17),
          createLifetimeAttribute(600),
          createStringAttribute(STUN_ATTRIBUTES.USERNAME, creds.username),
          createStringAttribute(STUN_ATTRIBUTES.REALM, r),
          createStringAttribute(STUN_ATTRIBUTES.NONCE, n),
        ],
        integrityKey: key,
        addFingerprint: true,
      });

      stage = 'challenged';
      socket.send(pkt, port, host);
    };

    socket.on('message', (msg) => {
      if (isSettled) return;
      try {
        const decoded = decodeStunMessage(msg);
        if (!decoded.header.transactionId.equals(transactionId)) {
          return;
        }

        const rttMs = Math.round((performance.now() - startTime) * 100) / 100;

        if (stage === 'initial') {
          if (decoded.header.type === STUN_MESSAGE_TYPES.ALLOCATE_ERROR_RESPONSE) {
            if (decoded.errorCode?.code === 401 && decoded.realm && decoded.nonce) {
              realm = decoded.realm;
              nonce = decoded.nonce;
              sendAuthenticatedAllocate(realm, nonce);
              return;
            } else {
              clearTimeout(timer);
              isSettled = true;
              try {
                socket.close();
              } catch {
                // ignore
              }
              resolve({
                host,
                port,
                transport: 'udp',
                rttMs,
                success: false,
                realm: decoded.realm,
                software: decoded.software,
                error: `TURN error ${decoded.errorCode?.code}: ${decoded.errorCode?.reason}`,
                stageReached: 'unauthorized_probe',
              });
              return;
            }
          } else if (decoded.header.type === STUN_MESSAGE_TYPES.ALLOCATE_RESPONSE) {
            // Server allowed allocation without auth (rare)
            clearTimeout(timer);
            isSettled = true;
            try {
              socket.close();
            } catch {
              // ignore
            }
            resolve({
              host,
              port,
              transport: 'udp',
              rttMs,
              success: true,
              relayedAddress: decoded.xorRelayedAddress,
              mappedAddress: decoded.xorMappedAddress || decoded.mappedAddress,
              lifetime: decoded.lifetime,
              software: decoded.software,
              stageReached: 'authenticated_allocation',
            });
            return;
          }
        } else if (stage === 'challenged') {
          clearTimeout(timer);
          isSettled = true;
          try {
            socket.close();
          } catch {
            // ignore
          }

          if (decoded.header.type === STUN_MESSAGE_TYPES.ALLOCATE_RESPONSE) {
            resolve({
              host,
              port,
              transport: 'udp',
              rttMs,
              success: true,
              relayedAddress: decoded.xorRelayedAddress,
              mappedAddress: decoded.xorMappedAddress || decoded.mappedAddress,
              lifetime: decoded.lifetime,
              realm,
              software: decoded.software,
              stageReached: 'authenticated_allocation',
            });
          } else {
            resolve({
              host,
              port,
              transport: 'udp',
              rttMs,
              success: false,
              realm,
              software: decoded.software,
              error: decoded.errorCode ? `TURN Allocation Rejected (${decoded.errorCode.code}): ${decoded.errorCode.reason}` : 'TURN Allocation rejected',
              stageReached: 'authenticated_allocation',
            });
          }
        }
      } catch (err: any) {
        clearTimeout(timer);
        isSettled = true;
        try {
          socket.close();
        } catch {
          // ignore
        }
        resolve({
          host,
          port,
          transport: 'udp',
          rttMs: 0,
          success: false,
          error: `Error parsing TURN response: ${err.message}`,
          stageReached: 'failed',
        });
      }
    });

    socket.on('error', (err) => {
      if (isSettled) return;
      clearTimeout(timer);
      isSettled = true;
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve({
        host,
        port,
        transport: 'udp',
        rttMs: 0,
        success: false,
        error: `Socket error: ${err.message}`,
        stageReached: 'failed',
      });
    });

    sendInitialAllocate();
  });
}

function probeTurnStream(
  host: string,
  port: number,
  useTls: boolean,
  creds: TurnCredentials | undefined,
  timeoutMs: number
): Promise<TurnProbeResult> {
  const transportName = useTls ? 'tls' : 'tcp';

  return new Promise((resolve) => {
    let transactionId = randomBytes(12);
    let stage: 'initial' | 'challenged' = 'initial';
    let realm = creds?.realm;
    let nonce: string | undefined;
    const startTime = performance.now();
    let isSettled = false;
    let rxBuffer = Buffer.alloc(0);

    let socket: net.Socket;

    const timer = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      socket?.destroy();
      resolve({
        host,
        port,
        transport: transportName,
        rttMs: timeoutMs,
        success: false,
        error: `TURN ${transportName.toUpperCase()} connection timed out after ${timeoutMs}ms`,
        stageReached: 'failed',
      });
    }, timeoutMs);

    const onConnected = () => {
      const pkt = encodeStunMessage({
        type: STUN_MESSAGE_TYPES.ALLOCATE_REQUEST,
        transactionId,
        attributes: [
          createRequestedTransportAttribute(17),
          createLifetimeAttribute(600),
        ],
        addFingerprint: true,
      });
      socket.write(pkt);
    };

    if (useTls) {
      socket = tls.connect(
        {
          host,
          port,
          rejectUnauthorized: false, // Allow self-signed or test certificates
          servername: net.isIP(host) ? undefined : host,
        },
        onConnected
      );
    } else {
      socket = new net.Socket();
      socket.connect(port, host, onConnected);
    }

    const sendAuthenticatedAllocate = (r: string, n: string) => {
      if (!creds || !creds.username || !creds.credential) {
        clearTimeout(timer);
        isSettled = true;
        socket.destroy();
        resolve({
          host,
          port,
          transport: transportName,
          rttMs: Math.round(performance.now() - startTime),
          success: false,
          realm: r,
          error: `TURN server responded with 401 challenge (Realm: ${r}), but credentials were not supplied`,
          stageReached: 'unauthorized_probe',
        });
        return;
      }

      const key = computeTurnKey(creds.username, r, creds.credential);
      transactionId = randomBytes(12);

      const pkt = encodeStunMessage({
        type: STUN_MESSAGE_TYPES.ALLOCATE_REQUEST,
        transactionId,
        attributes: [
          createRequestedTransportAttribute(17),
          createLifetimeAttribute(600),
          createStringAttribute(STUN_ATTRIBUTES.USERNAME, creds.username),
          createStringAttribute(STUN_ATTRIBUTES.REALM, r),
          createStringAttribute(STUN_ATTRIBUTES.NONCE, n),
        ],
        integrityKey: key,
        addFingerprint: true,
      });

      stage = 'challenged';
      rxBuffer = Buffer.alloc(0);
      socket.write(pkt);
    };

    socket.on('data', (chunk) => {
      if (isSettled) return;
      rxBuffer = Buffer.concat([rxBuffer, chunk]);

      if (rxBuffer.length >= 20) {
        const declaredLen = rxBuffer.readUInt16BE(2);
        if (rxBuffer.length >= 20 + declaredLen) {
          const currentPacket = rxBuffer.subarray(0, 20 + declaredLen);
          rxBuffer = rxBuffer.subarray(20 + declaredLen);

          try {
            const decoded = decodeStunMessage(currentPacket);
            if (!decoded.header.transactionId.equals(transactionId)) {
              return;
            }

            const rttMs = Math.round((performance.now() - startTime) * 100) / 100;

            if (stage === 'initial') {
              if (decoded.header.type === STUN_MESSAGE_TYPES.ALLOCATE_ERROR_RESPONSE) {
                if (decoded.errorCode?.code === 401 && decoded.realm && decoded.nonce) {
                  realm = decoded.realm;
                  nonce = decoded.nonce;
                  sendAuthenticatedAllocate(realm, nonce);
                  return;
                } else {
                  clearTimeout(timer);
                  isSettled = true;
                  socket.destroy();
                  resolve({
                    host,
                    port,
                    transport: transportName,
                    rttMs,
                    success: false,
                    realm: decoded.realm,
                    software: decoded.software,
                    error: `TURN Error ${decoded.errorCode?.code}: ${decoded.errorCode?.reason}`,
                    stageReached: 'unauthorized_probe',
                  });
                  return;
                }
              } else if (decoded.header.type === STUN_MESSAGE_TYPES.ALLOCATE_RESPONSE) {
                clearTimeout(timer);
                isSettled = true;
                socket.destroy();
                resolve({
                  host,
                  port,
                  transport: transportName,
                  rttMs,
                  success: true,
                  relayedAddress: decoded.xorRelayedAddress,
                  mappedAddress: decoded.xorMappedAddress || decoded.mappedAddress,
                  lifetime: decoded.lifetime,
                  software: decoded.software,
                  stageReached: 'authenticated_allocation',
                });
                return;
              }
            } else if (stage === 'challenged') {
              clearTimeout(timer);
              isSettled = true;
              socket.destroy();

              if (decoded.header.type === STUN_MESSAGE_TYPES.ALLOCATE_RESPONSE) {
                resolve({
                  host,
                  port,
                  transport: transportName,
                  rttMs,
                  success: true,
                  relayedAddress: decoded.xorRelayedAddress,
                  mappedAddress: decoded.xorMappedAddress || decoded.mappedAddress,
                  lifetime: decoded.lifetime,
                  realm,
                  software: decoded.software,
                  stageReached: 'authenticated_allocation',
                });
              } else {
                resolve({
                  host,
                  port,
                  transport: transportName,
                  rttMs,
                  success: false,
                  realm,
                  software: decoded.software,
                  error: decoded.errorCode ? `TURN Allocation Rejected (${decoded.errorCode.code}): ${decoded.errorCode.reason}` : 'TURN Allocation rejected',
                  stageReached: 'authenticated_allocation',
                });
              }
            }
          } catch (err: any) {
            clearTimeout(timer);
            isSettled = true;
            socket.destroy();
            resolve({
              host,
              port,
              transport: transportName,
              rttMs: 0,
              success: false,
              error: `Failed to decode ${transportName.toUpperCase()} response: ${err.message}`,
              stageReached: 'failed',
            });
          }
        }
      }
    });

    socket.on('error', (err) => {
      if (isSettled) return;
      clearTimeout(timer);
      isSettled = true;
      socket.destroy();
      resolve({
        host,
        port,
        transport: transportName,
        rttMs: 0,
        success: false,
        error: `Stream error: ${err.message}`,
        stageReached: 'failed',
      });
    });
  });
}
