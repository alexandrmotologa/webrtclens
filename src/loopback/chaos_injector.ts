/**
 * WebRTCLens - Network Chaos Simulation Engine
 */

export interface ChaosConfig {
  packetLossPercent: number; // 0 to 50%
  latencyMs: number;         // 0 to 1000ms
  jitterMs: number;          // 0 to 200ms
  bandwidthCapKbps?: number; // Optional bitrate clamp
  enabled: boolean;
}

export const DEFAULT_CHAOS_CONFIG: ChaosConfig = {
  packetLossPercent: 0,
  latencyMs: 0,
  jitterMs: 0,
  enabled: false,
};

export class ChaosInjector {
  private config: ChaosConfig;

  constructor(initialConfig: Partial<ChaosConfig> = {}) {
    this.config = { ...DEFAULT_CHAOS_CONFIG, ...initialConfig };
  }

  updateConfig(newConfig: Partial<ChaosConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): ChaosConfig {
    return { ...this.config };
  }

  /**
   * Evaluates whether a packet or frame should be dropped based on configured loss probability
   */
  shouldDropPacket(): boolean {
    if (!this.config.enabled || this.config.packetLossPercent <= 0) {
      return false;
    }
    return Math.random() * 100 < this.config.packetLossPercent;
  }

  /**
   * Computes artificial delay with randomized jitter distribution
   */
  computePacketDelayMs(): number {
    if (!this.config.enabled) return 0;
    const baseLatency = Math.max(0, this.config.latencyMs);
    if (this.config.jitterMs <= 0) return baseLatency;

    // Normal-ish distribution approximation using Box-Muller transform
    const u1 = Math.max(0.0001, Math.random());
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

    const jitterDelta = z * (this.config.jitterMs / 2);
    return Math.max(0, Math.round(baseLatency + jitterDelta));
  }
}
