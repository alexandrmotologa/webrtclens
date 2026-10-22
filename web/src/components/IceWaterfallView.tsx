import React, { useState } from 'react';
import { Network, Play, ShieldAlert, CheckCircle2, Clock, ArrowRight, Layers, HelpCircle } from 'lucide-react';

interface WaterfallCandidate {
  id: string;
  type: 'host' | 'srflx' | 'prflx' | 'relay';
  transport: 'udp' | 'tcp';
  address: string;
  port: number;
  priority: number;
  elapsedMs: number;
  source: string;
}

interface CandidatePairView {
  id: string;
  localType: string;
  localAddr: string;
  remoteType: string;
  remoteAddr: string;
  priority: string;
  state: string;
  score: number;
  nominated: boolean;
}

export const IceWaterfallView: React.FC = () => {
  const [gathering, setGathering] = useState<boolean>(false);
  const [candidates, setCandidates] = useState<WaterfallCandidate[]>([]);
  const [pairs, setPairs] = useState<CandidatePairView[]>([]);
  const [traversalType, setTraversalType] = useState<'direct_lan' | 'stun_p2p' | 'turn_relay' | 'disconnected'>('stun_p2p');
  const [diagnosticsScore, setDiagnosticsScore] = useState<number>(85);
  const [issues, setIssues] = useState<Array<{ title: string; text: string; severity: string }>>([]);

  // Trigger real in-browser WebRTC candidate gathering
  const runBrowserGathering = () => {
    setGathering(true);
    setCandidates([]);
    setPairs([]);
    setIssues([]);

    const gatheredList: WaterfallCandidate[] = [];
    const startTime = performance.now();

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      // Dummy channel to trigger gathering
      pc.createDataChannel('webrtclens-probe');

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const c = event.candidate;
          const elapsed = Math.round((performance.now() - startTime) * 10) / 10;
          const type = (c.type as any) || 'host';

          let source = 'Local Interface';
          if (type === 'srflx') source = 'Google STUN';
          else if (type === 'relay') source = 'TURN Server';

          const item: WaterfallCandidate = {
            id: `${type}_${c.address || (c as any).ip || '0.0.0.0'}_${c.port || 0}`,
            type,
            transport: (c.protocol?.toLowerCase() as any) || 'udp',
            address: c.address || (c as any).ip || '0.0.0.0',
            port: c.port || 0,
            priority: c.priority || 0,
            elapsedMs: elapsed,
            source,
          };

          gatheredList.push(item);
          setCandidates([...gatheredList]);
        }
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          setGathering(false);
          finalizePairs(gatheredList);
          pc.close();
        }
      };

      pc.createOffer().then((offer) => pc.setLocalDescription(offer));

      // Safety timeout after 5 seconds
      setTimeout(() => {
        if (pc.signalingState !== 'closed') {
          setGathering(false);
          finalizePairs(gatheredList);
          pc.close();
        }
      }, 4500);
    } catch (err) {
      console.error(err);
      setGathering(false);
    }
  };

  const finalizePairs = (candList: WaterfallCandidate[]) => {
    if (candList.length === 0) {
      setTraversalType('disconnected');
      setDiagnosticsScore(30);
      setIssues([
        {
          title: 'No Candidates Gathered',
          text: 'Browser could not gather any local or reflexive candidates. Check network connectivity.',
          severity: 'critical',
        },
      ]);
      return;
    }

    // Generate mock remote candidate (e.g. simulated peer in cloud)
    const remoteHost: WaterfallCandidate = {
      id: 'rem_host',
      type: 'host',
      transport: 'udp',
      address: '10.0.1.5',
      port: 50002,
      priority: 2113937151,
      elapsedMs: 0,
      source: 'Remote Peer',
    };
    const remoteSrflx: WaterfallCandidate = {
      id: 'rem_srflx',
      type: 'srflx',
      transport: 'udp',
      address: '198.51.100.22',
      port: 61002,
      priority: 1677729535,
      elapsedMs: 0,
      source: 'Remote STUN',
    };

    const simulatedPairs: CandidatePairView[] = [];
    const remotes = [remoteSrflx, remoteHost];

    for (const local of candList) {
      for (const remote of remotes) {
        // RFC 5245 Priority Formula
        const g = BigInt(local.priority >>> 0);
        const d = BigInt(remote.priority >>> 0);
        const minVal = g < d ? g : d;
        const maxVal = g > d ? g : d;
        const pri = 4294967296n * minVal + 2n * maxVal + (g > d ? 1n : 0n);

        let score = 75;
        if (local.type === 'host' && remote.type === 'host') score = 95;
        if (local.type === 'srflx' && remote.type === 'srflx') score = 85;

        simulatedPairs.push({
          id: `${local.id}-${remote.id}`,
          localType: local.type,
          localAddr: `${local.address}:${local.port}`,
          remoteType: remote.type,
          remoteAddr: `${remote.address}:${remote.port}`,
          priority: pri.toString(),
          state: 'waiting',
          score,
          nominated: false,
        });
      }
    }

    simulatedPairs.sort((a, b) => (BigInt(b.priority) > BigInt(a.priority) ? 1 : -1));

    if (simulatedPairs[0]) {
      simulatedPairs[0].nominated = true;
      simulatedPairs[0].state = 'succeeded';
      if (simulatedPairs[0].localType === 'host' && simulatedPairs[0].remoteType === 'host') {
        setTraversalType('direct_lan');
      } else {
        setTraversalType('stun_p2p');
      }
    }

    setPairs(simulatedPairs);

    // Diagnostics checks
    const hasSrflx = candList.some((c) => c.type === 'srflx');
    const hasRelay = candList.some((c) => c.type === 'relay');
    const detectedIssues: Array<{ title: string; text: string; severity: string }> = [];

    if (!hasSrflx && !hasRelay) {
      detectedIssues.push({
        title: 'Host-Only Candidates Gathered',
        text: 'Only local network interface IPs gathered. Direct WAN traversal will fail without STUN.',
        severity: 'warning',
      });
    }

    if (!hasRelay) {
      detectedIssues.push({
        title: 'No TURN Server Configured',
        text: 'Without a TURN relay, symmetric NAT pairs and strict corporate firewalls cannot establish media sessions.',
        severity: 'info',
      });
    }

    setIssues(detectedIssues);
    setDiagnosticsScore(hasSrflx ? (hasRelay ? 98 : 85) : 55);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Network className="w-5 h-5 text-cyan-400" />
            ICE Candidate Waterfall &amp; Topology Visualizer
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Traces the real candidate gathering lifecycle (host &rarr; srflx &rarr; relay) and computes RFC 5245 pair priority rankings
          </p>
        </div>

        <button
          onClick={runBrowserGathering}
          disabled={gathering}
          className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition shadow-sm disabled:opacity-50 flex items-center gap-2"
        >
          <Play className={`w-3.5 h-3.5 ${gathering ? 'animate-spin' : ''}`} />
          {gathering ? 'Gathering ICE Candidates...' : 'Gather Local Candidates'}
        </button>
      </div>

      {/* Waterfall & Topology Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Candidate Waterfall Timeline */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Gathering Lifecycle Waterfall
              </span>
              <span className="text-[11px] font-mono text-cyan-300">
                {candidates.length} candidates gathered
              </span>
            </div>

            {candidates.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs italic">
                Click "Gather Local Candidates" to initiate live browser STUN discovery.
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                {candidates.map((cand, idx) => {
                  const maxTime = Math.max(...candidates.map((c) => c.elapsedMs), 100);
                  const barPercent = Math.min(100, Math.max(12, (cand.elapsedMs / maxTime) * 100));

                  const typeColor =
                    cand.type === 'host'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : cand.type === 'srflx'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-purple-500/20 text-purple-300 border-purple-500/40';

                  return (
                    <div key={idx} className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${typeColor}`}>
                            {cand.type}
                          </span>
                          <span className="font-mono text-slate-200 text-xs font-semibold">
                            {cand.address}:{cand.port}
                          </span>
                        </div>
                        <span className="font-mono text-cyan-400 text-xs font-bold">
                          +{cand.elapsedMs}ms
                        </span>
                      </div>

                      {/* Visual Waterfall Bar */}
                      <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${barPercent}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>Source: {cand.source}</span>
                        <span>Priority: {cand.priority}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Diagnostics Card */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-cyan-400" />
                ICE Traversal Health Score
              </span>
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                diagnosticsScore >= 80 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {diagnosticsScore} / 100
              </span>
            </div>

            {issues.length === 0 ? (
              <p className="text-xs text-slate-400">
                Gather local candidates above to run rule-based NAT traversal diagnostics.
              </p>
            ) : (
              <div className="space-y-2">
                {issues.map((issue, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-0.5">
                    <span className="font-semibold text-slate-200">{issue.title}</span>
                    <p className="text-slate-400 text-[11px] leading-relaxed">{issue.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Network Topology Map & Pair Matrix */}
        <div className="lg:col-span-6 space-y-4">
          {/* Topology Diagram SVG */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Interactive Traversal Topology
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 capitalize">
                {traversalType.replace('_', ' ')}
              </span>
            </div>

            <div className="relative w-full h-44 bg-slate-950 rounded-lg border border-slate-800/80 flex items-center justify-between px-6">
              {/* Local Peer Node */}
              <div className="flex flex-col items-center space-y-1 z-10">
                <div className="w-12 h-12 rounded-xl bg-cyan-950/60 border-2 border-cyan-400 flex items-center justify-center text-cyan-300 font-bold text-xs shadow-lg">
                  Local
                </div>
                <span className="text-[10px] text-slate-400 font-medium">Browser</span>
              </div>

              {/* Middle NAT / STUN Node */}
              <div className="flex flex-col items-center space-y-1 z-10">
                <div className="w-12 h-12 rounded-xl bg-slate-900 border-2 border-blue-400 flex items-center justify-center text-blue-300 font-bold text-xs shadow-lg">
                  STUN
                </div>
                <span className="text-[10px] text-slate-400 font-medium">Reflexive NAT</span>
              </div>

              {/* Remote Peer Node */}
              <div className="flex flex-col items-center space-y-1 z-10">
                <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border-2 border-emerald-400 flex items-center justify-center text-emerald-300 font-bold text-xs shadow-lg">
                  Remote
                </div>
                <span className="text-[10px] text-slate-400 font-medium">Peer</span>
              </div>

              {/* Traversal Wire SVG Lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                <line x1="20%" y1="50%" x2="50%" y2="50%" stroke="#0ea5e9" strokeWidth="2" strokeDasharray="4 4" className="animate-pulse" />
                <line x1="50%" y1="50%" x2="80%" y2="50%" stroke="#10b981" strokeWidth="2" strokeDasharray="4 4" className="animate-pulse" />
              </svg>
            </div>
          </div>

          {/* Candidate Pair Priority Matrix */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
              RFC 5245 Candidate Pair Priority Matrix
            </span>

            {pairs.length === 0 ? (
              <div className="py-6 text-center text-slate-500 text-xs italic">
                Pairs will be formed and evaluated after gathering candidates.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60 max-h-56">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Local Candidate</th>
                      <th className="py-2 px-3">Remote Candidate</th>
                      <th className="py-2 px-3">Pair Priority</th>
                      <th className="py-2 px-3">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {pairs.slice(0, 5).map((pair) => (
                      <tr key={pair.id} className={pair.nominated ? 'bg-emerald-950/20' : ''}>
                        <td className="py-2 px-3 text-cyan-300">
                          [{pair.localType.toUpperCase()}] {pair.localAddr}
                        </td>
                        <td className="py-2 px-3 text-emerald-300">
                          [{pair.remoteType.toUpperCase()}] {pair.remoteAddr}
                        </td>
                        <td className="py-2 px-3 text-slate-300 truncate max-w-[120px]">
                          {pair.priority}
                        </td>
                        <td className="py-2 px-3">
                          {pair.nominated ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-sans text-[10px] font-bold">
                              Nominated
                            </span>
                          ) : (
                            <span className="text-slate-500 font-sans text-[10px]">
                              Waiting
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
