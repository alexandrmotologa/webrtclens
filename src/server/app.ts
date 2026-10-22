/**
 * WebRTCLens - Fastify REST API Server
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseSdp } from '../sdp/parser.js';
import { diffSdp } from '../sdp/diff.js';
import { SDP_SAMPLES } from '../sdp/samples.js';
import { probeStun, parseStunUrl } from '../stun_turn/stun_client.js';
import { probeTurn, parseTurnUrl } from '../stun_turn/turn_client.js';
import { runBenchmark } from '../stun_turn/benchmark.js';
import { parseCandidate } from '../ice/candidate.js';
import { buildPairMatrix } from '../ice/pair_matrix.js';
import { generateTopologyGraph } from '../ice/topology.js';
import { diagnoseIceConnectivity } from '../ice/diagnostics.js';

// Ensure BigInt serializes as string in JSON responses
if (typeof (BigInt.prototype as any).toJSON !== 'function') {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BuildServerOptions {
  enableStatic?: boolean;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  await app.register(cors, {
    origin: '*',
  });

  // Health check
  app.get('/api/health', async () => {
    return {
      status: 'ok',
      service: 'WebRTCLens',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // SDP Endpoints
  app.get('/api/sdp/samples', async () => {
    return SDP_SAMPLES;
  });

  app.post('/api/sdp/parse', async (request, reply) => {
    const body = request.body as { sdp?: string };
    if (!body?.sdp) {
      return reply.code(400).send({ error: 'Missing "sdp" in request body' });
    }
    try {
      const ast = parseSdp(body.sdp);
      return ast;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  app.post('/api/sdp/diff', async (request, reply) => {
    const body = request.body as { offer?: string; answer?: string };
    if (!body?.offer || !body?.answer) {
      return reply.code(400).send({ error: 'Both "offer" and "answer" SDP strings are required' });
    }

    try {
      const offerAst = parseSdp(body.offer);
      const answerAst = parseSdp(body.answer);
      const diff = diffSdp(offerAst, answerAst);

      return {
        offer: offerAst,
        answer: answerAst,
        diff,
      };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // STUN & TURN Probe Endpoints
  app.post('/api/probe/stun', async (request, reply) => {
    const body = request.body as {
      url?: string;
      host?: string;
      port?: number;
      transport?: 'udp' | 'tcp';
      timeoutMs?: number;
    };

    let host = body.host;
    let port = body.port;
    let transport = body.transport || 'udp';

    if (body.url) {
      const parsed = parseStunUrl(body.url);
      host = parsed.host;
      port = parsed.port;
      transport = parsed.transport;
    }

    if (!host) {
      return reply.code(400).send({ error: 'STUN host or url is required' });
    }

    const result = await probeStun({
      host,
      port,
      transport,
      timeoutMs: body.timeoutMs || 3000,
    });

    return result;
  });

  app.post('/api/probe/turn', async (request, reply) => {
    const body = request.body as {
      url?: string;
      host?: string;
      port?: number;
      transport?: 'udp' | 'tcp' | 'tls';
      username?: string;
      credential?: string;
      realm?: string;
      timeoutMs?: number;
    };

    let host = body.host;
    let port = body.port;
    let transport = body.transport || 'udp';

    if (body.url) {
      const parsed = parseTurnUrl(body.url);
      host = parsed.host;
      port = parsed.port;
      transport = parsed.transport;
    }

    if (!host) {
      return reply.code(400).send({ error: 'TURN host or url is required' });
    }

    const credentials =
      body.username && body.credential
        ? {
            username: body.username,
            credential: body.credential,
            realm: body.realm,
          }
        : undefined;

    const result = await probeTurn({
      host,
      port,
      transport,
      credentials,
      timeoutMs: body.timeoutMs || 4000,
    });

    return result;
  });

  app.post('/api/probe/benchmark', async (request, reply) => {
    const body = request.body as {
      url?: string;
      host?: string;
      port?: number;
      transport?: 'udp' | 'tcp';
      iterations?: number;
      intervalMs?: number;
    };

    let host = body.host;
    let port = body.port;
    let transport = body.transport || 'udp';

    if (body.url) {
      const parsed = parseStunUrl(body.url);
      host = parsed.host;
      port = parsed.port;
      transport = parsed.transport;
    }

    if (!host) {
      return reply.code(400).send({ error: 'Host or url is required' });
    }

    const result = await runBenchmark({
      host,
      port,
      transport,
      iterations: body.iterations || 5,
      intervalMs: body.intervalMs || 150,
    });

    return result;
  });

  // ICE Topology and Pair Matrix Endpoints
  app.post('/api/ice/analyze', async (request, reply) => {
    const body = request.body as {
      localCandidates?: string[];
      remoteCandidates?: string[];
    };

    if (!body?.localCandidates || !body?.remoteCandidates) {
      return reply.code(400).send({ error: 'Both localCandidates and remoteCandidates arrays are required' });
    }

    try {
      const local = body.localCandidates.map((c) => parseCandidate(c));
      const remote = body.remoteCandidates.map((c) => parseCandidate(c));

      const matrix = buildPairMatrix(local, remote);
      const topology = generateTopologyGraph(local, remote, matrix.nominatedPair);
      const diagnostics = diagnoseIceConnectivity(local, remote, matrix.pairs);

      return {
        matrix,
        topology,
        diagnostics,
      };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Serve static web app if available
  const webDistPath = path.resolve(__dirname, '../../web/dist');
  if (options.enableStatic !== false && fs.existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
    });

    app.setNotFoundHandler((_req, res) => {
      res.sendFile('index.html');
    });
  }

  return app;
}
