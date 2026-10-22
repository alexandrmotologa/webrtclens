/**
 * WebRTCLens - Mock STUN and TURN UDP Server for Offline Testing
 */

import dgram from 'node:dgram';
import {
  STUN_MESSAGE_TYPES,
  STUN_ATTRIBUTES,
} from '../../src/stun_turn/protocol.js';
import {
  encodeStunMessage,
  createXorAddressAttribute,
  createStringAttribute,
  createLifetimeAttribute,
} from '../../src/stun_turn/encoder.js';
import { decodeStunMessage } from '../../src/stun_turn/decoder.js';
import { computeTurnKey } from '../../src/stun_turn/turn_client.js';

export interface MockServerInstance {
  host: string;
  port: number;
  close: () => Promise<void>;
}

export function startMockStunTurnServer(): Promise<MockServerInstance> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const validUser = 'testuser';
    const validRealm = 'webrtclens.org';
    const validPass = 'secret123';
    const testNonce = 'nonce_abc_123';

    socket.on('message', (msg, rinfo) => {
      try {
        const decoded = decodeStunMessage(msg);
        const type = decoded.header.type;
        const txId = decoded.header.transactionId;

        if (type === STUN_MESSAGE_TYPES.BINDING_REQUEST) {
          // Respond with Binding Response
          const resp = encodeStunMessage({
            type: STUN_MESSAGE_TYPES.BINDING_RESPONSE,
            transactionId: txId,
            attributes: [
              createXorAddressAttribute(
                STUN_ATTRIBUTES.XOR_MAPPED_ADDRESS,
                rinfo.address,
                rinfo.port,
                txId
              ),
              createStringAttribute(STUN_ATTRIBUTES.SOFTWARE, 'WebRTCLens-Mock/1.0'),
            ],
            addFingerprint: true,
          });
          socket.send(resp, rinfo.port, rinfo.address);
        } else if (type === STUN_MESSAGE_TYPES.ALLOCATE_REQUEST) {
          // Check if credentials are provided
          if (!decoded.username || !decoded.realm || !decoded.hasMessageIntegrity) {
            // Respond with 401 Unauthorized
            const errVal = Buffer.alloc(4 + 'Unauthorized'.length);
            errVal.writeUInt8(0, 0);
            errVal.writeUInt8(0, 1);
            errVal.writeUInt8(4, 2); // Class 4
            errVal.writeUInt8(1, 3); // Number 01
            errVal.write('Unauthorized', 4, 'utf8');

            const resp = encodeStunMessage({
              type: STUN_MESSAGE_TYPES.ALLOCATE_ERROR_RESPONSE,
              transactionId: txId,
              attributes: [
                { type: STUN_ATTRIBUTES.ERROR_CODE, value: errVal },
                createStringAttribute(STUN_ATTRIBUTES.REALM, validRealm),
                createStringAttribute(STUN_ATTRIBUTES.NONCE, testNonce),
                createStringAttribute(STUN_ATTRIBUTES.SOFTWARE, 'WebRTCLens-Mock/1.0'),
              ],
              addFingerprint: true,
            });
            socket.send(resp, rinfo.port, rinfo.address);
          } else {
            // Validate credentials
            if (decoded.username === validUser && decoded.realm === validRealm) {
              const key = computeTurnKey(validUser, validRealm, validPass);
              const resp = encodeStunMessage({
                type: STUN_MESSAGE_TYPES.ALLOCATE_RESPONSE,
                transactionId: txId,
                attributes: [
                  createXorAddressAttribute(
                    STUN_ATTRIBUTES.XOR_RELAYED_ADDRESS,
                    '198.51.100.55',
                    50012,
                    txId
                  ),
                  createXorAddressAttribute(
                    STUN_ATTRIBUTES.XOR_MAPPED_ADDRESS,
                    rinfo.address,
                    rinfo.port,
                    txId
                  ),
                  createLifetimeAttribute(600),
                  createStringAttribute(STUN_ATTRIBUTES.SOFTWARE, 'WebRTCLens-Mock/1.0'),
                ],
                integrityKey: key,
                addFingerprint: true,
              });
              socket.send(resp, rinfo.port, rinfo.address);
            } else {
              // Respond 403 Forbidden
              const errVal = Buffer.alloc(4 + 'Forbidden'.length);
              errVal.writeUInt8(0, 0);
              errVal.writeUInt8(0, 1);
              errVal.writeUInt8(4, 2);
              errVal.writeUInt8(3, 3);
              errVal.write('Forbidden', 4, 'utf8');

              const resp = encodeStunMessage({
                type: STUN_MESSAGE_TYPES.ALLOCATE_ERROR_RESPONSE,
                transactionId: txId,
                attributes: [
                  { type: STUN_ATTRIBUTES.ERROR_CODE, value: errVal },
                  createStringAttribute(STUN_ATTRIBUTES.SOFTWARE, 'WebRTCLens-Mock/1.0'),
                ],
                addFingerprint: true,
              });
              socket.send(resp, rinfo.port, rinfo.address);
            }
          }
        }
      } catch {
        // ignore malformed test packets
      }
    });

    socket.bind(0, '127.0.0.1', () => {
      const addr = socket.address();
      resolve({
        host: '127.0.0.1',
        port: addr.port,
        close: () =>
          new Promise((done) => {
            socket.close(() => done());
          }),
      });
    });

    socket.on('error', (err) => {
      reject(err);
    });
  });
}
