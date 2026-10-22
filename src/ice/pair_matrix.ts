/**
 * WebRTCLens - ICE Candidate Pair Priority Matrix (RFC 5245 & RFC 8445)
 */

import type { IceCandidate } from './candidate.js';

export type PairState = 'waiting' | 'in-progress' | 'succeeded' | 'failed' | 'frozen';

export interface CandidatePair {
  id: string;
  local: IceCandidate;
  remote: IceCandidate;
  priority: string; // BigInt serialized as string for JSON transport
  priorityBigInt: bigint;
  state: PairState;
  nominated: boolean;
  roundTripTimeMs?: number;
  score: number; // 0 to 100 quality heuristic
}

export interface PairMatrixResult {
  pairs: CandidatePair[];
  nominatedPair?: CandidatePair;
  topPriorityPair?: CandidatePair;
  totalCombinations: number;
}

/**
 * Computes RFC 5245 pair priority:
 * Priority = 2^32 * MIN(G, D) + 2 * MAX(G, D) + (G > D ? 1 : 0)
 * G = Priority of controlling agent candidate
 * D = Priority of controlled agent candidate
 */
export function computePairPriority(controllingPri: number, controlledPri: number): bigint {
  const g = BigInt(controllingPri >>> 0);
  const d = BigInt(controlledPri >>> 0);

  const minVal = g < d ? g : d;
  const maxVal = g > d ? g : d;
  const tieBreaker = g > d ? 1n : 0n;

  // 2^32 = 4294967296n
  return (4294967296n * minVal) + (2n * maxVal) + tieBreaker;
}

export function buildPairMatrix(
  localCandidates: IceCandidate[],
  remoteCandidates: IceCandidate[],
  options?: { isControlling?: boolean; simulatedRtts?: Record<string, number> }
): PairMatrixResult {
  const isControlling = options?.isControlling ?? true;
  const pairs: CandidatePair[] = [];

  for (const local of localCandidates) {
    for (const remote of remoteCandidates) {
      // Must match component ID and transport family
      if (local.component !== remote.component) continue;
      if (local.transport !== remote.transport) continue;

      const controllingPri = isControlling ? local.priority : remote.priority;
      const controlledPri = isControlling ? remote.priority : local.priority;

      const priorityBigInt = computePairPriority(controllingPri, controlledPri);
      const id = `${local.type}:${local.ip}:${local.port}-${remote.type}:${remote.ip}:${remote.port}`;

      // Calculate connection viability score
      let score = 50;
      if (local.type === 'host' && remote.type === 'host') score = 95;
      else if (local.type === 'host' && remote.type === 'srflx') score = 85;
      else if (local.type === 'srflx' && remote.type === 'srflx') score = 75;
      else if (local.type === 'relay' || remote.type === 'relay') score = 60;

      const simulatedRtt = options?.simulatedRtts?.[id];

      const pair: CandidatePair = {
        id,
        local,
        remote,
        priority: priorityBigInt.toString(),
        priorityBigInt,
        state: 'waiting',
        nominated: false,
        roundTripTimeMs: simulatedRtt,
        score,
      };
      Object.defineProperty(pair, 'priorityBigInt', {
        value: priorityBigInt,
        enumerable: false,
        writable: true,
      });
      pairs.push(pair);
    }
  }

  // Sort descending by priority
  pairs.sort((a, b) => {
    if (a.priorityBigInt > b.priorityBigInt) return -1;
    if (a.priorityBigInt < b.priorityBigInt) return 1;
    return 0;
  });

  const topPriorityPair = pairs[0];
  let nominatedPair: CandidatePair | undefined;

  if (topPriorityPair) {
    topPriorityPair.state = 'succeeded';
    topPriorityPair.nominated = true;
    nominatedPair = topPriorityPair;
  }

  return {
    pairs,
    nominatedPair,
    topPriorityPair,
    totalCombinations: pairs.length,
  };
}
