/**
 * WebRTCLens - WebRTC RTCStats Delta Calculator and Telemetry Parser
 */

export interface RawMediaStatsSnapshot {
  timestampMs: number;
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsSent: number;
  packetsLost: number;
  jitterSeconds?: number;
  roundTripTimeSeconds?: number;
  framesDecoded?: number;
  framesDropped?: number;
  frameWidth?: number;
  frameHeight?: number;
}

export interface ComputedMediaMetrics {
  timestampMs: number;
  bitrateInKbps: number;
  bitrateOutKbps: number;
  packetLossPercent: number;
  totalPacketsLost: number;
  jitterMs: number;
  roundTripTimeMs: number;
  fps: number;
  framesDropped: number;
  resolution?: string;
}

export class WebRtcStatsTracker {
  private prevSnapshot?: RawMediaStatsSnapshot;

  computeDelta(curr: RawMediaStatsSnapshot): ComputedMediaMetrics {
    if (!this.prevSnapshot) {
      this.prevSnapshot = curr;
      return {
        timestampMs: curr.timestampMs,
        bitrateInKbps: 0,
        bitrateOutKbps: 0,
        packetLossPercent: 0,
        totalPacketsLost: curr.packetsLost,
        jitterMs: curr.jitterSeconds ? Math.round(curr.jitterSeconds * 1000) : 0,
        roundTripTimeMs: curr.roundTripTimeSeconds ? Math.round(curr.roundTripTimeSeconds * 1000) : 0,
        fps: 0,
        framesDropped: curr.framesDropped || 0,
        resolution: curr.frameWidth && curr.frameHeight ? `${curr.frameWidth}x${curr.frameHeight}` : undefined,
      };
    }

    const prev = this.prevSnapshot;
    const timeDeltaMs = Math.max(1, curr.timestampMs - prev.timestampMs);
    const timeDeltaSec = timeDeltaMs / 1000;

    // Bitrate = (bytesDelta * 8) / (seconds * 1000) = kbps
    const bytesInDelta = Math.max(0, curr.bytesReceived - prev.bytesReceived);
    const bytesOutDelta = Math.max(0, curr.bytesSent - prev.bytesSent);
    const bitrateInKbps = Math.round(((bytesInDelta * 8) / timeDeltaSec / 1000) * 10) / 10;
    const bitrateOutKbps = Math.round(((bytesOutDelta * 8) / timeDeltaSec / 1000) * 10) / 10;

    // Packet Loss
    const packetsInDelta = Math.max(0, curr.packetsReceived - prev.packetsReceived);
    const packetsLostDelta = Math.max(0, curr.packetsLost - prev.packetsLost);
    const totalExpectedPackets = packetsInDelta + packetsLostDelta;

    const packetLossPercent =
      totalExpectedPackets > 0
        ? Math.round((packetsLostDelta / totalExpectedPackets) * 1000) / 10
        : 0;

    // Frame rate
    const framesDelta = Math.max(0, (curr.framesDecoded || 0) - (prev.framesDecoded || 0));
    const fps = Math.round((framesDelta / timeDeltaSec) * 10) / 10;

    const jitterMs = curr.jitterSeconds ? Math.round(curr.jitterSeconds * 10000) / 10 : 0;
    const roundTripTimeMs = curr.roundTripTimeSeconds ? Math.round(curr.roundTripTimeSeconds * 10000) / 10 : 0;

    this.prevSnapshot = curr;

    return {
      timestampMs: curr.timestampMs,
      bitrateInKbps,
      bitrateOutKbps,
      packetLossPercent,
      totalPacketsLost: curr.packetsLost,
      jitterMs,
      roundTripTimeMs,
      fps,
      framesDropped: curr.framesDropped || 0,
      resolution: curr.frameWidth && curr.frameHeight ? `${curr.frameWidth}x${curr.frameHeight}` : undefined,
    };
  }

  reset(): void {
    this.prevSnapshot = undefined;
  }
}
