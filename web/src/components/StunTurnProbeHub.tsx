import React, { useState } from 'react';
import { Radio, CheckCircle2, XCircle, ArrowUpRight, Zap, RefreshCw, Terminal, Globe, Shield } from 'lucide-react';

interface StunProbeResult {
  host: string;
  port: number;
  transport: 'udp' | 'tcp';
  rttMs: number;
  mappedAddress?: { family: string; port: number; address: string };
  software?: string;
  success: boolean;
  error?: string;
}

interface TurnProbeResult {
  host: string;
  port: number;
  transport: 'udp' | 'tcp' | 'tls';
  rttMs: number;
  success: boolean;
  relayedAddress?: { family: string; port: number; address: string };
  mappedAddress?: { family: string; port: number; address: string };
  lifetime?: number;
  realm?: string;
  software?: string;
  error?: string;
  stageReached: string;
}

interface BenchmarkReport {
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
  natType: string;
  natSummary: string;
  recommendations: string[];
  history: Array<{ probeIndex: number; rttMs: number; success: boolean; error?: string }>;
}

export const StunTurnProbeHub: React.FC = () => {
  const [serverUrl, setServerUrl] = useState<string>('stun:stun.l.google.com:19302');
  const [transport, setTransport] = useState<'udp' | 'tcp' | 'tls'>('udp');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [mode, setMode] = useState<'stun' | 'turn' | 'benchmark'>('stun');

  const [stunResult, setStunResult] = useState<StunProbeResult | null>(null);
  const [turnResult, setTurnResult] = useState<TurnProbeResult | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkReport | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toISOString().slice(11, 23);
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 49)]);
  };

  const presets = [
    { label: 'Google STUN', url: 'stun:stun.l.google.com:19302', type: 'stun' },
    { label: 'Cloudflare STUN', url: 'stun:stun.cloudflare.com:3478', type: 'stun' },
    { label: 'Twilio STUN', url: 'stun:global.stun.twilio.com:3478', type: 'stun' },
    { label: 'Metered STUN', url: 'stun:stun.relay.metered.ca:80', type: 'stun' },
  ];

  const handleApplyPreset = (preset: typeof presets[0]) => {
    setServerUrl(preset.url);
    setMode(preset.type as any);
  };

  const runStunProbe = async () => {
    setLoading(true);
    setStunResult(null);
    setTurnResult(null);
    setBenchmarkResult(null);
    addLog(`Sending RFC 5389 STUN Binding Request to ${serverUrl} over ${transport.toUpperCase()}...`);

    try {
      const res = await fetch('/api/probe/stun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: serverUrl, transport: transport === 'tls' ? 'tcp' : transport }),
      });
      const data: StunProbeResult = await res.json();
      setStunResult(data);

      if (data.success && data.mappedAddress) {
        addLog(`✓ Received Binding Response in ${data.rttMs}ms! XOR-MAPPED-ADDR: ${data.mappedAddress.address}:${data.mappedAddress.port}`);
      } else {
        addLog(`✖ STUN Probe failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      addLog(`✖ Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const runTurnProbe = async () => {
    setLoading(true);
    setStunResult(null);
    setTurnResult(null);
    setBenchmarkResult(null);
    addLog(`Initiating RFC 8656 TURN Allocation probe to ${serverUrl} over ${transport.toUpperCase()}...`);

    try {
      const res = await fetch('/api/probe/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: serverUrl,
          transport,
          username: username || undefined,
          credential: password || undefined,
        }),
      });
      const data: TurnProbeResult = await res.json();
      setTurnResult(data);

      if (data.success && data.relayedAddress) {
        addLog(`✓ TURN Allocation succeeded in ${data.rttMs}ms! Relayed IP: ${data.relayedAddress.address}:${data.relayedAddress.port}, Lifetime: ${data.lifetime}s`);
      } else {
        addLog(`✖ TURN probe response: ${data.error || 'Failed'}`);
      }
    } catch (err: any) {
      addLog(`✖ Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const runBenchmarkProbe = async () => {
    setLoading(true);
    setStunResult(null);
    setTurnResult(null);
    setBenchmarkResult(null);
    addLog(`Running multi-probe benchmark (5 iterations) on ${serverUrl}...`);

    try {
      const res = await fetch('/api/probe/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: serverUrl, transport: transport === 'tls' ? 'tcp' : transport, iterations: 5 }),
      });
      const data: BenchmarkReport = await res.json();
      setBenchmarkResult(data);

      addLog(`✓ Benchmark complete: ${data.successfulProbes}/${data.sentProbes} probes (${data.packetLossPercent}% loss). Avg RTT: ${data.avgRttMs}ms, Jitter: ${data.jitterMs}ms, NAT: ${data.natType.toUpperCase()}`);
    } catch (err: any) {
      addLog(`✖ Benchmark error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-400" />
            STUN &amp; TURN Benchmark Protocol Tester
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Sends binary RFC 5389 Binding and RFC 8656 Allocation packets to measure RTT latency and verify NAT traversal
          </p>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Presets:</span>
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => handleApplyPreset(p)}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200 transition"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input Configuration Card */}
      <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          {/* Server URL Input */}
          <div className="lg:col-span-6 space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Server Endpoint URI</label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="stun:stun.l.google.com:19302 or turn:relay.example.com:3478"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Transport Selector */}
          <div className="lg:col-span-2 space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Transport</label>
            <select
              value={transport}
              onChange={(e) => setTransport(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="udp">UDP (RFC 5389)</option>
              <option value="tcp">TCP (Stream)</option>
              <option value="tls">TLS / TURNS (5349)</option>
            </select>
          </div>

          {/* Mode Selector & Action Buttons */}
          <div className="lg:col-span-4 flex items-center gap-2">
            <button
              onClick={runStunProbe}
              disabled={loading}
              className="flex-1 py-2 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              STUN Probe
            </button>

            <button
              onClick={runTurnProbe}
              disabled={loading}
              className="flex-1 py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Radio className="w-3.5 h-3.5" />
              TURN Probe
            </button>

            <button
              onClick={runBenchmarkProbe}
              disabled={loading}
              className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
              title="Run 5-iteration benchmark"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Benchmark
            </button>
          </div>
        </div>

        {/* Optional TURN Credentials Accordion */}
        <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">TURN Username (optional for STUN)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. webrtcuser"
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">TURN Credential / Password (optional)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="e.g. secretKey123"
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* Main Results Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Structured Diagnostics Card */}
        <div className="lg:col-span-7 space-y-4">
          {/* STUN Result Card */}
          {stunResult && (
            <div className={`p-4 rounded-xl border space-y-3 ${
              stunResult.success ? 'bg-slate-900/60 border-slate-800' : 'bg-rose-950/20 border-rose-500/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {stunResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400" />
                  )}
                  <span className="font-bold text-sm text-white">
                    {stunResult.success ? 'STUN Binding Successful' : 'STUN Binding Failed'}
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-bold">
                  RTT: {stunResult.rttMs}ms
                </span>
              </div>

              {stunResult.success && stunResult.mappedAddress && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">
                      XOR-MAPPED-ADDRESS
                    </span>
                    <span className="text-base font-mono font-bold text-cyan-300 mt-1 block">
                      {stunResult.mappedAddress.address}:{stunResult.mappedAddress.port}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">Your public reflexive WAN IP</span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">
                      Server Software
                    </span>
                    <span className="text-sm font-mono text-slate-200 mt-1 block truncate">
                      {stunResult.software || 'Google / Standard STUN'}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">RFC 5389 Software Attribute</span>
                  </div>
                </div>
              )}

              {stunResult.error && (
                <p className="text-xs text-rose-300 font-mono">{stunResult.error}</p>
              )}
            </div>
          )}

          {/* TURN Result Card */}
          {turnResult && (
            <div className={`p-4 rounded-xl border space-y-3 ${
              turnResult.success ? 'bg-slate-900/60 border-slate-800' : 'bg-rose-950/20 border-rose-500/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {turnResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400" />
                  )}
                  <span className="font-bold text-sm text-white">
                    {turnResult.success ? 'TURN Relay Allocation Granted' : 'TURN Allocation Rejected'}
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold">
                  Handshake: {turnResult.rttMs}ms
                </span>
              </div>

              {turnResult.success && turnResult.relayedAddress && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">
                      XOR-RELAYED-ADDRESS
                    </span>
                    <span className="text-base font-mono font-bold text-emerald-400 mt-1 block">
                      {turnResult.relayedAddress.address}:{turnResult.relayedAddress.port}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">Relay port allocated on TURN server</span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">
                      Allocation Lifetime
                    </span>
                    <span className="text-base font-mono font-bold text-white mt-1 block">
                      {turnResult.lifetime} seconds
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      Realm: {turnResult.realm || 'Default'}
                    </span>
                  </div>
                </div>
              )}

              {turnResult.error && (
                <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30">
                  <span className="text-[11px] font-semibold text-rose-300 block">Failure Details:</span>
                  <span className="text-xs text-rose-200 font-mono mt-0.5 block">{turnResult.error}</span>
                </div>
              )}
            </div>
          )}

          {/* Benchmark Report Card */}
          {benchmarkResult && (
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white">Network Traversal &amp; Jitter Benchmark</h3>
                  <p className="text-xs text-slate-400">{benchmarkResult.sentProbes} probes sent over {benchmarkResult.transport.toUpperCase()}</p>
                </div>
                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-xs font-bold uppercase">
                  NAT: {benchmarkResult.natType}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 block">Packet Loss</span>
                  <span className="text-sm font-mono font-bold text-white mt-0.5 block">
                    {benchmarkResult.packetLossPercent}%
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 block">Min RTT</span>
                  <span className="text-sm font-mono font-bold text-emerald-400 mt-0.5 block">
                    {benchmarkResult.minRttMs}ms
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 block">Avg RTT</span>
                  <span className="text-sm font-mono font-bold text-cyan-300 mt-0.5 block">
                    {benchmarkResult.avgRttMs}ms
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 block">Jitter (RFC 3550)</span>
                  <span className="text-sm font-mono font-bold text-amber-400 mt-0.5 block">
                    {benchmarkResult.jitterMs}ms
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-cyan-400" />
                  NAT Traversal Assessment
                </span>
                <p className="text-xs text-slate-400 leading-relaxed">{benchmarkResult.natSummary}</p>
                {benchmarkResult.recommendations.map((rec, idx) => (
                  <div key={idx} className="text-[11px] text-cyan-200/90 flex items-center gap-1.5 pt-1">
                    <span className="w-1 h-1 rounded-full bg-cyan-400" />
                    {rec}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State when no probe has run yet */}
          {!stunResult && !turnResult && !benchmarkResult && (
            <div className="p-8 rounded-xl bg-slate-900/30 border border-dashed border-slate-800 text-center space-y-2">
              <Globe className="w-8 h-8 text-slate-600 mx-auto" />
              <h4 className="text-sm font-semibold text-slate-300">Ready to Probe WebRTC Signaling</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Select a STUN or TURN preset above and click "STUN Probe" or "TURN Probe" to evaluate your NAT mapping and round-trip latency.
              </p>
            </div>
          )}
        </div>

        {/* Right Side: Live Protocol Console Logs */}
        <div className="lg:col-span-5 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex flex-col h-[420px]">
          <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/80 border-b border-slate-800 text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              Live Protocol Probe Stream
            </span>
            <span className="text-[10px] text-slate-500 font-mono">{logs.length} messages</span>
          </div>
          <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] space-y-1.5 text-slate-300">
            {logs.length === 0 ? (
              <span className="text-slate-600 italic">No packets sent yet. Initiate a probe above.</span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="leading-relaxed">
                  <span className={log.includes('✓') ? 'text-emerald-400 font-semibold' : log.includes('✖') ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
                    {log}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
