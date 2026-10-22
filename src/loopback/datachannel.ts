/**
 * WebRTCLens - WebRTC SCTP DataChannel Inspector and Throughput Benchmark
 */

export type ChannelState = 'connecting' | 'open' | 'closing' | 'closed';

export interface MinimalDataChannel {
  readyState: ChannelState | string;
  bufferedAmount: number;
  send: (data: string | Uint8Array) => void;
  onopen?: ((ev?: any) => void) | null;
  onclose?: ((ev?: any) => void) | null;
  onmessage?: ((ev: { data: any }) => void) | null;
  close?: () => void;
}

export interface DataChannelMetrics {
  messagesSent: number;
  messagesReceived: number;
  bytesSent: number;
  bytesReceived: number;
  bufferedAmountBytes: number;
  pingRttMs: number;
  throughputMbps: number;
  state: string;
}

export interface PingMessage {
  type: 'ping' | 'pong';
  id: number;
  timestamp: number;
}

export class DataChannelBenchmarker {
  private localDc?: MinimalDataChannel;
  private remoteDc?: MinimalDataChannel;
  private pingId = 0;
  private pendingPings = new Map<number, number>();

  public metrics: DataChannelMetrics = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
    bufferedAmountBytes: 0,
    pingRttMs: 0,
    throughputMbps: 0,
    state: 'closed',
  };

  attachChannels(local: MinimalDataChannel, remote: MinimalDataChannel): void {
    this.localDc = local;
    this.remoteDc = remote;
    this.metrics.state = String(local.readyState);

    local.onopen = () => {
      this.metrics.state = String(local.readyState);
    };
    local.onclose = () => {
      this.metrics.state = String(local.readyState);
    };

    // When remote receives a message, if it's ping, reply with pong
    remote.onmessage = (event: { data: any }) => {
      this.metrics.messagesReceived++;
      this.metrics.bytesReceived += typeof event.data === 'string' ? event.data.length : event.data.byteLength || 0;

      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'ping') {
            remote.send(JSON.stringify({ type: 'pong', id: parsed.id, timestamp: parsed.timestamp }));
          }
        } catch {
          // Binary or raw text payload
        }
      }
    };

    // When local receives pong
    local.onmessage = (event: { data: any }) => {
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'pong') {
            const sendTime = this.pendingPings.get(parsed.id);
            if (sendTime) {
              this.metrics.pingRttMs = Math.round((performance.now() - sendTime) * 100) / 100;
              this.pendingPings.delete(parsed.id);
            }
          }
        } catch {
          // ignore
        }
      }
    };
  }

  sendPing(): void {
    if (!this.localDc || this.localDc.readyState !== 'open') return;
    this.pingId++;
    const now = performance.now();
    this.pendingPings.set(this.pingId, now);

    const msg = JSON.stringify({ type: 'ping', id: this.pingId, timestamp: now });
    this.localDc.send(msg);
    this.metrics.messagesSent++;
    this.metrics.bytesSent += msg.length;
    this.metrics.bufferedAmountBytes = this.localDc.bufferedAmount;
  }

  sendBurst(chunkSizeBytes = 16384, chunkCount = 10): Promise<{ durationMs: number; mbps: number }> {
    return new Promise((resolve, reject) => {
      if (!this.localDc || this.localDc.readyState !== 'open') {
        return reject(new Error('DataChannel is not open'));
      }

      const chunk = new Uint8Array(chunkSizeBytes);
      const totalBytes = chunkSizeBytes * chunkCount;
      const startTime = performance.now();

      for (let i = 0; i < chunkCount; i++) {
        this.localDc.send(chunk);
        this.metrics.messagesSent++;
        this.metrics.bytesSent += chunkSizeBytes;
      }

      const checkDrain = () => {
        if (!this.localDc) return;
        this.metrics.bufferedAmountBytes = this.localDc.bufferedAmount;

        if (this.localDc.bufferedAmount === 0) {
          const durationSec = Math.max(0.001, (performance.now() - startTime) / 1000);
          const mbps = Math.round(((totalBytes * 8) / durationSec / 1000000) * 100) / 100;
          this.metrics.throughputMbps = mbps;
          resolve({ durationMs: Math.round(durationSec * 1000), mbps });
        } else {
          setTimeout(checkDrain, 15);
        }
      };

      checkDrain();
    });
  }
}
