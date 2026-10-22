/**
 * WebRTCLens - STUN/TURN Benchmark and NAT Traversal Evaluator
 */

import { probeStun, type StunProbeOptions, type StunProbeResult } from './stun_client.js';

export interface BenchmarkOptions extends StunProbeOptions {
  iterations?: number;
  intervalMs?: number;
}

export type NatType =
  | 'open_internet'
  | 'full_cone'
  | 'restricted_cone'
  | 'symmetric'
  | 'udp_blocked'
  | 'unknown';

export interface BenchmarkReport {
  target: string;
  transport: 'udp' | 'tcp';
  sentProbes: number;
  successfulProbes: number;
  packetLossPercent: number;
  minRttMs: number;
  avgRttMs: number;
  maxRttMs: number;
  jitterMs: number;
  mappedIp?: string;
  mappedPort?: number;
  natType: NatType;
  natSummary: string;
  recommendations: string[];
  history: Array<{ probeIndex: number; rttMs: number; success: boolean; error?: string }>;
}

export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkReport> {
  const iterations = Math.min(Math.max(options.iterations || 5, 2), 20);
  const intervalMs = options.intervalMs || 150;
  const history: Array<{ probeIndex: number; rttMs: number; success: boolean; error?: string }> = [];

  const successfulRtts: number[] = [];
  let mappedIp: string | undefined;
  let mappedPort: number | undefined;

  for (let i = 0; i < iterations; i++) {
    const res: StunProbeResult = await probeStun(options);
    history.push({
      probeIndex: i + 1,
      rttMs: res.rttMs,
      success: res.success,
      error: res.error,
    });

    if (res.success) {
      successfulRtts.push(res.rttMs);
      if (res.mappedAddress) {
        mappedIp = res.mappedAddress.address;
        mappedPort = res.mappedAddress.port;
      }
    }

    if (i < iterations - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  const successfulProbes = successfulRtts.length;
  const packetLossPercent = Math.round(((iterations - successfulProbes) / iterations) * 100);

  let minRttMs = 0;
  let maxRttMs = 0;
  let avgRttMs = 0;
  let jitterMs = 0;

  if (successfulRtts.length > 0) {
    minRttMs = Math.min(...successfulRtts);
    maxRttMs = Math.max(...successfulRtts);
    const sum = successfulRtts.reduce((a, b) => a + b, 0);
    avgRttMs = Math.round((sum / successfulRtts.length) * 100) / 100;

    // RFC 3550 Jitter estimate: mean absolute difference between consecutive delays
    if (successfulRtts.length > 1) {
      let diffSum = 0;
      for (let i = 1; i < successfulRtts.length; i++) {
        diffSum += Math.abs(successfulRtts[i] - successfulRtts[i - 1]);
      }
      jitterMs = Math.round((diffSum / (successfulRtts.length - 1)) * 100) / 100;
    }
  }

  // NAT Classification heuristics
  let natType: NatType = 'unknown';
  let natSummary = '';
  const recommendations: string[] = [];

  if (successfulProbes === 0) {
    natType = 'udp_blocked';
    natSummary = 'UDP traffic blocked or STUN endpoint unreachable. Relayed TURN over TCP/TLS is strictly required.';
    recommendations.push('Deploy TURN over TLS (port 5349) to bypass outbound UDP blocking on corporate firewalls.');
    recommendations.push('Verify that the remote STUN server is operational and resolving correctly.');
  } else if (packetLossPercent > 20) {
    natType = 'restricted_cone';
    natSummary = `High packet loss (${packetLossPercent}%) detected on UDP signaling/connectivity path.`;
    recommendations.push('High packet loss will cause audio cutouts and WebRTC ICE gathering timeouts.');
    recommendations.push('Configure TURN TCP fallback for users on unstable network paths.');
  } else {
    natType = 'full_cone';
    natSummary = 'Low latency STUN reflexive mapping established. Direct P2P media connections will succeed in most topologies.';
    recommendations.push('STUN binding is healthy. Direct host-to-srflx media pairs will connect quickly.');
    if (avgRttMs > 150) {
      recommendations.push(`Average STUN RTT is ${avgRttMs}ms. Consider deploying geographically distributed TURN/STUN edge nodes closer to your users.`);
    }
  }

  return {
    target: `${options.host}:${options.port || 3478}`,
    transport: options.transport || 'udp',
    sentProbes: iterations,
    successfulProbes,
    packetLossPercent,
    minRttMs,
    avgRttMs,
    maxRttMs,
    jitterMs,
    mappedIp,
    mappedPort,
    natType,
    natSummary,
    recommendations,
    history,
  };
}
