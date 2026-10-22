/**
 * WebRTCLens - STUN Binding Client (RFC 5389)
 */

import dgram from 'node:dgram';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { STUN_MESSAGE_TYPES, type StunAddress } from './protocol.js';
import { encodeStunMessage } from './encoder.js';
import { decodeStunMessage } from './decoder.js';

export interface StunProbeOptions {
  host: string;
  port?: number;
  transport?: 'udp' | 'tcp';
  timeoutMs?: number;
}

export interface StunProbeResult {
  host: string;
  port: number;
  transport: 'udp' | 'tcp';
  rttMs: number;
  mappedAddress?: StunAddress;
  software?: string;
  success: boolean;
  error?: string;
}

export function parseStunUrl(rawUrl: string): { host: string; port: number; transport: 'udp' | 'tcp' } {
  let cleaned = rawUrl.trim();
  if (cleaned.startsWith('stun:')) {
    cleaned = cleaned.slice(5);
  } else if (cleaned.startsWith('stuns:')) {
    cleaned = cleaned.slice(6);
  }

  // Check transport parameter if present (e.g. ?transport=tcp)
  let transport: 'udp' | 'tcp' = 'udp';
  const paramIdx = cleaned.indexOf('?');
  if (paramIdx !== -1) {
    const params = new URLSearchParams(cleaned.slice(paramIdx + 1));
    if (params.get('transport')?.toLowerCase() === 'tcp') {
      transport = 'tcp';
    }
    cleaned = cleaned.slice(0, paramIdx);
  }

  let host = cleaned;
  let port = 3478;

  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    host = parts[0];
    port = parseInt(parts[1], 10) || 3478;
  }

  return { host, port, transport };
}

export async function probeStun(options: StunProbeOptions): Promise<StunProbeResult> {
  const host = options.host;
  const port = options.port || 3478;
  const transport = options.transport || 'udp';
  const timeoutMs = options.timeoutMs || 3000;

  if (transport === 'tcp') {
    return probeStunTcp(host, port, timeoutMs);
  }
  return probeStunUdp(host, port, timeoutMs);
}

function probeStunUdp(host: string, port: number, timeoutMs: number): Promise<StunProbeResult> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const transactionId = randomBytes(12);

    const requestPacket = encodeStunMessage({
      type: STUN_MESSAGE_TYPES.BINDING_REQUEST,
      transactionId,
      addFingerprint: true,
    });

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
        error: `STUN request timed out after ${timeoutMs}ms (UDP packet likely dropped by firewall or NAT)`,
      });
    }, timeoutMs);

    socket.on('message', (msg) => {
      if (isSettled) return;
      const rttMs = Math.round((performance.now() - startTime) * 100) / 100;

      try {
        const decoded = decodeStunMessage(msg);
        if (!decoded.header.transactionId.equals(transactionId)) {
          // Transaction ID mismatch
          return;
        }

        clearTimeout(timer);
        isSettled = true;
        try {
          socket.close();
        } catch {
          // ignore
        }

        if (decoded.header.type === STUN_MESSAGE_TYPES.BINDING_RESPONSE) {
          const mapped = decoded.xorMappedAddress || decoded.mappedAddress;
          resolve({
            host,
            port,
            transport: 'udp',
            rttMs,
            mappedAddress: mapped,
            software: decoded.software,
            success: true,
          });
        } else {
          resolve({
            host,
            port,
            transport: 'udp',
            rttMs,
            success: false,
            error: decoded.errorCode ? `STUN Error ${decoded.errorCode.code}: ${decoded.errorCode.reason}` : 'STUN binding error response',
          });
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
          rttMs,
          success: false,
          error: `Failed to decode STUN response: ${err.message}`,
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
      });
    });

    socket.send(requestPacket, port, host, (err) => {
      if (err && !isSettled) {
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
          error: `Send error: ${err.message}`,
        });
      }
    });
  });
}

function probeStunTcp(host: string, port: number, timeoutMs: number): Promise<StunProbeResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const transactionId = randomBytes(12);

    const requestPacket = encodeStunMessage({
      type: STUN_MESSAGE_TYPES.BINDING_REQUEST,
      transactionId,
      addFingerprint: true,
    });

    const startTime = performance.now();
    let isSettled = false;
    let rxBuffer = Buffer.alloc(0);

    const timer = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      socket.destroy();
      resolve({
        host,
        port,
        transport: 'tcp',
        rttMs: timeoutMs,
        success: false,
        error: `STUN TCP connection timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    socket.connect(port, host, () => {
      socket.write(requestPacket);
    });

    socket.on('data', (chunk) => {
      if (isSettled) return;
      rxBuffer = Buffer.concat([rxBuffer, chunk]);

      if (rxBuffer.length >= 20) {
        const declaredLen = rxBuffer.readUInt16BE(2);
        if (rxBuffer.length >= 20 + declaredLen) {
          const rttMs = Math.round((performance.now() - startTime) * 100) / 100;
          clearTimeout(timer);
          isSettled = true;
          socket.destroy();

          try {
            const decoded = decodeStunMessage(rxBuffer);
            const mapped = decoded.xorMappedAddress || decoded.mappedAddress;
            resolve({
              host,
              port,
              transport: 'tcp',
              rttMs,
              mappedAddress: mapped,
              software: decoded.software,
              success: decoded.header.type === STUN_MESSAGE_TYPES.BINDING_RESPONSE,
              error: decoded.errorCode ? `STUN Error ${decoded.errorCode.code}: ${decoded.errorCode.reason}` : undefined,
            });
          } catch (err: any) {
            resolve({
              host,
              port,
              transport: 'tcp',
              rttMs,
              success: false,
              error: `TCP Decode error: ${err.message}`,
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
        transport: 'tcp',
        rttMs: 0,
        success: false,
        error: `TCP error: ${err.message}`,
      });
    });
  });
}
