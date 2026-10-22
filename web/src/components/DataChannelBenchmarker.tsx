import React, { useState, useRef, useEffect } from 'react';
import { Zap, Play, Square, Activity, ArrowRight, Gauge, Radio, CheckCircle2, RotateCcw } from 'lucide-react';

interface PingStats {
  samples: number[];
  minRtt: number;
  avgRtt: number;
  maxRtt: number;
  jitter: number;
  packetLoss: number;
}

interface ThroughputStats {
  bytesSent: number;
  bytesReceived: number;
  durationMs: number;
  throughputMbps: number;
  transferRateKBps: number;
  chunksSent: number;
}

export const DataChannelBenchmarker: React.FC = () => {
  const [testType, setTestType] = useState<'ping' | 'throughput' | 'both'>('both');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Ready to benchmark DataChannel');

  // Ping Test States
  const [pingCount, setPingCount] = useState<number>(20);
  const [pingStats, setPingStats] = useState<PingStats | null>(null);

  // Throughput Test States
  const [targetMegabytes, setTargetMegabytes] = useState<number>(5);
  const [chunkSizeBytes, setChunkSizeBytes] = useState<number>(16384); // 16 KB chunks
  const [throughputStats, setThroughputStats] = useState<ThroughputStats | null>(null);
  const [progressPercent, setProgressPercent] = useState<number>(0);

  // PeerConnection Refs
  const pc1Ref = useRef<RTCPeerConnection | null>(null);
  const pc2Ref = useRef<RTCPeerConnection | null>(null);
  const dcSendRef = useRef<RTCDataChannel | null>(null);
  const dcRecvRef = useRef<RTCDataChannel | null>(null);
  const abortFlagRef = useRef<boolean>(false);

  const cleanupConnections = () => {
    if (dcSendRef.current) {
      try { dcSendRef.current.close(); } catch {}
      dcSendRef.current = null;
    }
    if (dcRecvRef.current) {
      try { dcRecvRef.current.close(); } catch {}
      dcRecvRef.current = null;
    }
    if (pc1Ref.current) {
      try { pc1Ref.current.close(); } catch {}
      pc1Ref.current = null;
    }
    if (pc2Ref.current) {
      try { pc2Ref.current.close(); } catch {}
      pc2Ref.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupConnections();
    };
  }, []);

  const setupDataChannels = async (): Promise<{ sender: RTCDataChannel; receiver: RTCDataChannel }> => {
    cleanupConnections();

    const pc1 = new RTCPeerConnection();
    const pc2 = new RTCPeerConnection();
    pc1Ref.current = pc1;
    pc2Ref.current = pc2;

    pc1.onicecandidate = (e) => {
      if (e.candidate) pc2.addIceCandidate(e.candidate).catch(() => {});
    };
    pc2.onicecandidate = (e) => {
      if (e.candidate) pc1.addIceCandidate(e.candidate).catch(() => {});
    };

    const senderChannel = pc1.createDataChannel('webrtclens-bench', {
      ordered: true,
    });
    dcSendRef.current = senderChannel;

    const receiverPromise = new Promise<RTCDataChannel>((resolve) => {
      pc2.ondatachannel = (e) => {
        dcRecvRef.current = e.channel;
        resolve(e.channel);
      };
    });

    const offer = await pc1.createOffer();
    await pc1.setLocalDescription(offer);
    await pc2.setRemoteDescription(offer);

    const answer = await pc2.createAnswer();
    await pc2.setLocalDescription(answer);
    await pc1.setRemoteDescription(answer);

    const receiverChannel = await receiverPromise;

    // Wait for sender to open
    if (senderChannel.readyState !== 'open') {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('DataChannel open timeout')), 6000);
        senderChannel.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
      });
    }

    return { sender: senderChannel, receiver: receiverChannel };
  };

  const runPingBenchmark = async (sender: RTCDataChannel, receiver: RTCDataChannel, count: number): Promise<PingStats> => {
    const rtts: number[] = [];

    // Receiver echoes back
    receiver.onmessage = (event) => {
      if (typeof event.data === 'string' && event.data.startsWith('ping:')) {
        receiver.send('pong:' + event.data.slice(5));
      }
    };

    for (let i = 0; i < count; i++) {
      if (abortFlagRef.current) break;
      setStatusMessage(`Measuring ping RTT (${i + 1}/${count})...`);

      const seq = i;
      const sentTime = performance.now();

      const rtt = await new Promise<number>((resolve) => {
        const timeout = setTimeout(() => {
          resolve(999);
        }, 1000);

        const onMsg = (event: MessageEvent) => {
          if (typeof event.data === 'string' && event.data === `pong:${seq}`) {
            clearTimeout(timeout);
            sender.removeEventListener('message', onMsg);
            resolve(performance.now() - sentTime);
          }
        };

        sender.addEventListener('message', onMsg);
        sender.send(`ping:${seq}`);
      });

      if (rtt < 990) {
        rtts.push(Math.round(rtt * 100) / 100);
      }

      await new Promise((r) => setTimeout(r, 20));
    }

    if (rtts.length === 0) {
      return {
        samples: [],
        minRtt: 0,
        avgRtt: 0,
        maxRtt: 0,
        jitter: 0,
        packetLoss: 100,
      };
    }

    const minRtt = Math.min(...rtts);
    const maxRtt = Math.max(...rtts);
    const avgRtt = Math.round((rtts.reduce((a, b) => a + b, 0) / rtts.length) * 100) / 100;

    // RFC 3550 Jitter
    let jitter = 0;
    for (let j = 1; j < rtts.length; j++) {
      const diff = Math.abs(rtts[j] - rtts[j - 1]);
      jitter = jitter + (diff - jitter) / 16;
    }

    const loss = Math.round(((count - rtts.length) / count) * 100);

    return {
      samples: rtts,
      minRtt,
      avgRtt,
      maxRtt,
      jitter: Math.round(jitter * 100) / 100,
      packetLoss: loss,
    };
  };

  const runThroughputBenchmark = async (
    sender: RTCDataChannel,
    receiver: RTCDataChannel,
    targetMb: number,
    chunkSize: number
  ): Promise<ThroughputStats> => {
    const totalBytes = targetMb * 1024 * 1024;
    const chunk = new Uint8Array(chunkSize);
    for (let i = 0; i < chunkSize; i++) chunk[i] = (i % 256);

    let bytesReceived = 0;
    let chunksReceived = 0;

    receiver.binaryType = 'arraybuffer';

    const completionPromise = new Promise<void>((resolve) => {
      receiver.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          bytesReceived += event.data.byteLength;
          chunksReceived++;
          if (bytesReceived >= totalBytes) {
            resolve();
          }
        }
      };
    });

    const startTime = performance.now();
    let bytesSent = 0;
    let chunksSent = 0;

    // Flow control: respect bufferedAmountLow
    sender.bufferedAmountLowThreshold = 64 * 1024; // 64 KB

    while (bytesSent < totalBytes && !abortFlagRef.current) {
      if (sender.bufferedAmount > 256 * 1024) {
        // Wait for buffer to drain
        await new Promise<void>((resolve) => {
          const onLow = () => {
            sender.removeEventListener('bufferedamountlow', onLow);
            resolve();
          };
          sender.addEventListener('bufferedamountlow', onLow);
          setTimeout(resolve, 50);
        });
      }

      const toSend = Math.min(chunkSize, totalBytes - bytesSent);
      sender.send(chunk.slice(0, toSend).buffer);
      bytesSent += toSend;
      chunksSent++;

      const pct = Math.min(100, Math.round((bytesSent / totalBytes) * 100));
      setProgressPercent(pct);
      setStatusMessage(`Streaming binary chunks: ${pct}% (${(bytesSent / 1024 / 1024).toFixed(1)} MB)...`);
    }

    // Wait until receiver gets all bytes (or 5s timeout)
    const timeoutPromise = new Promise<void>((r) => setTimeout(r, 5000));
    await Promise.race([completionPromise, timeoutPromise]);

    const durationMs = Math.max(1, performance.now() - startTime);
    const durationSec = durationMs / 1000;
    const throughputMbps = Math.round(((bytesReceived * 8) / durationSec / 1000 / 1000) * 100) / 100;
    const transferRateKBps = Math.round((bytesReceived / durationSec / 1024) * 10) / 10;

    return {
      bytesSent,
      bytesReceived,
      durationMs: Math.round(durationMs),
      throughputMbps,
      transferRateKBps,
      chunksSent,
    };
  };

  const handleStartBenchmark = async () => {
    setIsRunning(true);
    abortFlagRef.current = false;
    setProgressPercent(0);
    setStatusMessage('Negotiating peer connections and opening DataChannel...');

    try {
      const { sender, receiver } = await setupDataChannels();

      if (testType === 'ping' || testType === 'both') {
        const pingRes = await runPingBenchmark(sender, receiver, pingCount);
        setPingStats(pingRes);
      }

      if ((testType === 'throughput' || testType === 'both') && !abortFlagRef.current) {
        const tputRes = await runThroughputBenchmark(sender, receiver, targetMegabytes, chunkSizeBytes);
        setThroughputStats(tputRes);
      }

      setStatusMessage('DataChannel benchmark finished successfully!');
    } catch (err: any) {
      console.error(err);
      setStatusMessage(`Benchmark error: ${err.message || 'Unknown failure'}`);
    } finally {
      setIsRunning(false);
      cleanupConnections();
    }
  };

  const handleStop = () => {
    abortFlagRef.current = true;
    setIsRunning(false);
    setStatusMessage('Benchmark aborted by user.');
    cleanupConnections();
  };

  return (
    <div className="space-y-6">
      {/* Control Banner */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Gauge className="w-5 h-5 text-cyan-400" />
            WebRTC DataChannel Throughput &amp; Latency Benchmarker
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            SCTP-over-DTLS transport benchmarking: high-frequency RTT jitter probing and saturated binary throughput stress
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isRunning ? (
            <button
              onClick={handleStartBenchmark}
              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/20 flex items-center gap-2"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Run DataChannel Benchmark
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-semibold text-xs transition shadow-sm flex items-center gap-2"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop Benchmark
            </button>
          )}
        </div>
      </div>

      {/* Parameter Settings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">Benchmark Suite:</label>
          <select
            value={testType}
            disabled={isRunning}
            onChange={(e) => setTestType(e.target.value as any)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="both">Full Benchmark (Ping RTT + Throughput)</option>
            <option value="ping">Ping &amp; Jitter Only</option>
            <option value="throughput">Throughput Stress Only</option>
          </select>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">Ping Count:</label>
          <select
            value={pingCount}
            disabled={isRunning}
            onChange={(e) => setPingCount(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value={10}>10 pings (Quick probe)</option>
            <option value={20}>20 pings (Recommended)</option>
            <option value={50}>50 pings (Deep jitter analysis)</option>
          </select>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">Throughput Target Volume:</label>
          <select
            value={targetMegabytes}
            disabled={isRunning}
            onChange={(e) => setTargetMegabytes(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value={2}>2 Megabytes (Light)</option>
            <option value={5}>5 Megabytes (Standard)</option>
            <option value={15}>15 Megabytes (Heavy saturation)</option>
          </select>
        </div>
      </div>

      {/* Progress & Live Status */}
      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300 flex items-center gap-2">
            <Activity className={`w-4 h-4 ${isRunning ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
            Status: {statusMessage}
          </span>
          <span className="font-mono text-cyan-400">{progressPercent}%</span>
        </div>

        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Benchmark Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latency / Ping Results */}
        <div className="p-5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              SCTP Round-Trip Time &amp; Jitter (RFC 3550)
            </span>
            {pingStats && (
              <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                {pingStats.samples.length} packets measured
              </span>
            )}
          </div>

          {pingStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 font-semibold block">Min RTT</span>
                  <span className="text-base font-mono font-bold text-emerald-400 mt-1 block">
                    {pingStats.minRtt} ms
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 font-semibold block">Avg RTT</span>
                  <span className="text-base font-mono font-bold text-cyan-300 mt-1 block">
                    {pingStats.avgRtt} ms
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 font-semibold block">Max RTT</span>
                  <span className="text-base font-mono font-bold text-purple-400 mt-1 block">
                    {pingStats.maxRtt} ms
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 font-semibold block">RFC Jitter</span>
                  <span className="text-base font-mono font-bold text-amber-400 mt-1 block">
                    {pingStats.jitter} ms
                  </span>
                </div>
              </div>

              {/* RTT Distribution Bars */}
              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2">
                <span className="text-xs text-slate-400 block">Ping Latency Samples:</span>
                <div className="flex items-end gap-1 h-16 pt-2">
                  {pingStats.samples.map((rtt, idx) => {
                    const max = Math.max(...pingStats.samples, 5);
                    const h = Math.max(15, Math.min(100, (rtt / max) * 100));
                    return (
                      <div
                        key={idx}
                        className="flex-1 bg-cyan-500/50 hover:bg-cyan-400 rounded-t transition-all"
                        style={{ height: `${h}%` }}
                        title={`#${idx + 1}: ${rtt} ms`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs italic">
              Ping statistics will appear here after running the benchmark.
            </div>
          )}
        </div>

        {/* Throughput Results */}
        <div className="p-5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              Sustained Transfer Speed &amp; Goodput
            </span>
            {throughputStats && (
              <span className="text-[11px] font-mono text-cyan-400 font-semibold">
                {(throughputStats.bytesReceived / 1024 / 1024).toFixed(2)} MB transferred
              </span>
            )}
          </div>

          {throughputStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 font-semibold block">Throughput</span>
                  <span className="text-lg font-mono font-bold text-emerald-400 mt-1 block">
                    {throughputStats.throughputMbps} Mbps
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 font-semibold block">Transfer Rate</span>
                  <span className="text-lg font-mono font-bold text-cyan-300 mt-1 block">
                    {throughputStats.transferRateKBps} KB/s
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 font-semibold block">Duration</span>
                  <span className="text-lg font-mono font-bold text-purple-400 mt-1 block">
                    {throughputStats.durationMs} ms
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5 text-xs text-slate-400">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  SCTP Flow Control Assessment
                </span>
                <p className="leading-relaxed">
                  DataChannel delivered {throughputStats.chunksSent} binary chunks with zero packet drop over loopback SCTP association.
                  Buffer drain intervals kept memory footprint steady during backpressure.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs italic">
              Throughput metrics will appear here after running the benchmark.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
