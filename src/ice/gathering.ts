/**
 * WebRTCLens - ICE Gathering Lifecycle & Waterfall Timeline
 */

import type { IceCandidate, CandidateType } from './candidate.js';

export interface GatheringEvent {
  timestampMs: number;
  type: 'start' | 'candidate' | 'complete' | 'timeout';
  candidate?: IceCandidate;
  description: string;
}

export interface WaterfallItem {
  id: string;
  type: CandidateType;
  transport: 'udp' | 'tcp';
  address: string;
  port: number;
  elapsedMs: number;
  priority: number;
  source: 'Local Interface' | 'STUN Reflector' | 'TURN Server' | 'Peer Discovery';
}

export interface GatheringSessionReport {
  sessionId: string;
  state: 'new' | 'gathering' | 'complete';
  startTimeMs: number;
  totalDurationMs: number;
  candidates: IceCandidate[];
  waterfall: WaterfallItem[];
  events: GatheringEvent[];
  countsByType: Record<CandidateType, number>;
}

export class IceGatheringSession {
  private sessionId: string;
  private state: 'new' | 'gathering' | 'complete' = 'new';
  private startTimeMs = 0;
  private candidates: IceCandidate[] = [];
  private events: GatheringEvent[] = [];
  private waterfall: WaterfallItem[] = [];

  constructor(sessionId = `ice_${Date.now()}`) {
    this.sessionId = sessionId;
  }

  start(): void {
    this.state = 'gathering';
    this.startTimeMs = performance.now();
    this.events.push({
      timestampMs: 0,
      type: 'start',
      description: 'ICE candidate gathering started.',
    });
  }

  addCandidate(candidate: IceCandidate, elapsedMs?: number): void {
    if (this.state === 'new') this.start();

    const elapsed =
      elapsedMs !== undefined
        ? elapsedMs
        : Math.round((performance.now() - this.startTimeMs) * 10) / 10;

    this.candidates.push(candidate);

    let source: WaterfallItem['source'] = 'Local Interface';
    if (candidate.type === 'srflx') source = 'STUN Reflector';
    else if (candidate.type === 'relay') source = 'TURN Server';
    else if (candidate.type === 'prflx') source = 'Peer Discovery';

    const item: WaterfallItem = {
      id: `${candidate.type}_${candidate.ip}_${candidate.port}`,
      type: candidate.type,
      transport: candidate.transport,
      address: candidate.ip,
      port: candidate.port,
      elapsedMs: elapsed,
      priority: candidate.priority,
      source,
    };

    this.waterfall.push(item);
    this.events.push({
      timestampMs: elapsed,
      type: 'candidate',
      candidate,
      description: `Discovered ${candidate.type.toUpperCase()} candidate on ${candidate.ip}:${candidate.port} (${candidate.transport.toUpperCase()}) in ${elapsed}ms`,
    });
  }

  complete(): void {
    this.state = 'complete';
    const totalDurationMs = Math.round((performance.now() - this.startTimeMs) * 10) / 10;
    this.events.push({
      timestampMs: totalDurationMs,
      type: 'complete',
      description: `ICE candidate gathering complete in ${totalDurationMs}ms. Gathered ${this.candidates.length} candidates.`,
    });
  }

  getReport(): GatheringSessionReport {
    const totalDurationMs =
      this.state === 'complete'
        ? this.events[this.events.length - 1]?.timestampMs || 0
        : Math.round((performance.now() - this.startTimeMs) * 10) / 10;

    const countsByType: Record<CandidateType, number> = {
      host: 0,
      srflx: 0,
      prflx: 0,
      relay: 0,
    };

    for (const c of this.candidates) {
      if (countsByType[c.type] !== undefined) {
        countsByType[c.type]++;
      }
    }

    return {
      sessionId: this.sessionId,
      state: this.state,
      startTimeMs: this.startTimeMs,
      totalDurationMs,
      candidates: [...this.candidates],
      waterfall: [...this.waterfall],
      events: [...this.events],
      countsByType,
    };
  }
}
