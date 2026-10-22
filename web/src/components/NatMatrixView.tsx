import React, { useState, useEffect } from 'react';
import { Shield, Network, CheckCircle2, AlertTriangle, XCircle, HelpCircle, ArrowRight, Layers, Info } from 'lucide-react';

export type NatMappingType = 'endpoint_independent' | 'address_restricted' | 'port_restricted' | 'symmetric';

interface NatEvaluationResult {
  peerA: NatMappingType;
  peerB: NatMappingType;
  directP2pPossible: boolean;
  turnRequired: boolean;
  holePunchingDifficulty: 'none' | 'low' | 'moderate' | 'high' | 'impossible';
  rfcReference: string;
  explanation: string;
  traversalStrategy: string;
}

const NAT_LABELS: Record<NatMappingType, { short: string; full: string; desc: string }> = {
  endpoint_independent: {
    short: 'Endpoint-Independent',
    full: 'Endpoint-Independent Mapping (Full Cone NAT)',
    desc: 'Reuses the exact same external port for all outbound packets regardless of destination.',
  },
  address_restricted: {
    short: 'Address-Restricted',
    full: 'Address-Restricted Mapping (Restricted Cone NAT)',
    desc: 'Reuses external port for all destinations, but external inbound packets are dropped unless an outbound packet was first sent to that remote IP.',
  },
  port_restricted: {
    short: 'Port-Restricted',
    full: 'Port-Restricted Mapping (Port-Restricted Cone NAT)',
    desc: 'Inbound packets are dropped unless an outbound packet was first sent to that specific remote IP and remote port.',
  },
  symmetric: {
    short: 'Symmetric NAT',
    full: 'Symmetric Mapping (Symmetric / Carrier-Grade NAT)',
    desc: 'Allocates a unique external port for every unique remote destination IP:Port tuple.',
  },
};

const MATRIX_DATA: Record<NatMappingType, Record<NatMappingType, {
  status: 'direct' | 'hole_punch' | 'hard_punch' | 'relay_required';
  difficulty: 'none' | 'low' | 'moderate' | 'high' | 'impossible';
}>> = {
  endpoint_independent: {
    endpoint_independent: { status: 'direct', difficulty: 'none' },
    address_restricted: { status: 'direct', difficulty: 'low' },
    port_restricted: { status: 'direct', difficulty: 'low' },
    symmetric: { status: 'hole_punch', difficulty: 'moderate' },
  },
  address_restricted: {
    endpoint_independent: { status: 'direct', difficulty: 'low' },
    address_restricted: { status: 'hole_punch', difficulty: 'low' },
    port_restricted: { status: 'hole_punch', difficulty: 'moderate' },
    symmetric: { status: 'hard_punch', difficulty: 'high' },
  },
  port_restricted: {
    endpoint_independent: { status: 'direct', difficulty: 'low' },
    address_restricted: { status: 'hole_punch', difficulty: 'moderate' },
    port_restricted: { status: 'hole_punch', difficulty: 'moderate' },
    symmetric: { status: 'relay_required', difficulty: 'impossible' },
  },
  symmetric: {
    endpoint_independent: { status: 'hole_punch', difficulty: 'moderate' },
    address_restricted: { status: 'hard_punch', difficulty: 'high' },
    port_restricted: { status: 'relay_required', difficulty: 'impossible' },
    symmetric: { status: 'relay_required', difficulty: 'impossible' },
  },
};

export const NatMatrixView: React.FC = () => {
  const [peerA, setPeerA] = useState<NatMappingType>('endpoint_independent');
  const [peerB, setPeerB] = useState<NatMappingType>('symmetric');
  const [evalResult, setEvalResult] = useState<NatEvaluationResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const natTypes: NatMappingType[] = [
    'endpoint_independent',
    'address_restricted',
    'port_restricted',
    'symmetric',
  ];

  const fetchEvaluation = async (a: NatMappingType, b: NatMappingType) => {
    setLoading(true);
    try {
      const res = await fetch('/api/nat/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerA: a, peerB: b }),
      });
      const data = await res.json();
      setEvalResult(data);
    } catch {
      // Fallback local eval
      const matrixEntry = MATRIX_DATA[a][b];
      setEvalResult({
        peerA: a,
        peerB: b,
        directP2pPossible: matrixEntry.status !== 'relay_required',
        turnRequired: matrixEntry.status === 'relay_required',
        holePunchingDifficulty: matrixEntry.difficulty,
        rfcReference: 'RFC 5780 / RFC 8445 Section 7.2',
        explanation: matrixEntry.status === 'relay_required'
          ? 'Both peers alter external ports per destination or enforce strict port filtering. STUN reflexive binding predictions fail. Direct P2P cannot establish.'
          : 'Reflexive STUN candidates allow bidirectional hole-punching.',
        traversalStrategy: matrixEntry.status === 'relay_required'
          ? 'Mandatory RFC 8656 TURN Allocation Relay candidate'
          : 'RFC 8445 STUN Binding Request & Hole Punching',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvaluation(peerA, peerB);
  }, [peerA, peerB]);

  const selectPair = (a: NatMappingType, b: NatMappingType) => {
    setPeerA(a);
    setPeerB(b);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Network className="w-5 h-5 text-cyan-400" />
            RFC 5780 NAT Traversal &amp; Filtering Compatibility Matrix
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Theoretical &amp; empirical peer-to-peer connectivity matrix for all 16 permutations of NAT mapping and filtering behaviors
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
            RFC 5780 &bull; RFC 5389 &bull; RFC 8445
          </span>
        </div>
      </div>

      {/* 4x4 Grid Matrix */}
      <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-cyan-400" />
            Interactive 16-Permutation Compatibility Grid
          </span>
          <span className="text-xs text-slate-500">Click any grid cell to simulate the pair</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="p-2.5 text-left font-mono text-[11px] text-slate-400 bg-slate-950/60 border border-slate-800">
                  Peer A &darr; \ Peer B &rarr;
                </th>
                {natTypes.map((t) => (
                  <th
                    key={t}
                    className="p-2.5 text-center font-semibold text-slate-300 bg-slate-950/60 border border-slate-800 max-w-[130px]"
                  >
                    {NAT_LABELS[t].short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {natTypes.map((row) => (
                <tr key={row}>
                  <td className="p-2.5 font-semibold text-slate-300 bg-slate-950/60 border border-slate-800">
                    {NAT_LABELS[row].short}
                  </td>
                  {natTypes.map((col) => {
                    const item = MATRIX_DATA[row][col];
                    const isSelected = peerA === row && peerB === col;

                    let bgClass = 'bg-emerald-950/30 text-emerald-300 border-emerald-500/30 hover:bg-emerald-900/40';
                    let label = 'Direct P2P';

                    if (item.status === 'hole_punch') {
                      bgClass = 'bg-cyan-950/30 text-cyan-300 border-cyan-500/30 hover:bg-cyan-900/40';
                      label = 'Hole Punch';
                    } else if (item.status === 'hard_punch') {
                      bgClass = 'bg-amber-950/30 text-amber-300 border-amber-500/30 hover:bg-amber-900/40';
                      label = 'Asymmetric';
                    } else if (item.status === 'relay_required') {
                      bgClass = 'bg-rose-950/40 text-rose-300 border-rose-500/40 hover:bg-rose-900/50';
                      label = 'TURN Required';
                    }

                    return (
                      <td
                        key={col}
                        onClick={() => selectPair(row, col)}
                        className={`p-3 text-center border cursor-pointer transition-all ${bgClass} ${
                          isSelected ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950 font-bold shadow-lg' : ''
                        }`}
                      >
                        <div className="font-semibold">{label}</div>
                        <div className="text-[10px] opacity-75 font-mono capitalize mt-0.5">
                          {item.difficulty}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 pt-3 text-[11px] text-slate-400 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500/40 border border-emerald-500" />
            <span>Direct P2P Guaranteed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-cyan-500/40 border border-cyan-500" />
            <span>STUN Hole Punching</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500/40 border border-amber-500" />
            <span>Asymmetric Port Guessing (Low Reliability)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-500/40 border border-rose-500" />
            <span>RFC 8656 TURN Relay Mandatory</span>
          </div>
        </div>
      </div>

      {/* Interactive Pair Diagnostic Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Selectors */}
        <div className="lg:col-span-5 p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-cyan-400" />
            Pair Topology Simulation
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Peer A NAT Configuration:</label>
              <select
                value={peerA}
                onChange={(e) => setPeerA(e.target.value as NatMappingType)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
              >
                {natTypes.map((t) => (
                  <option key={t} value={t}>
                    {NAT_LABELS[t].full}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{NAT_LABELS[peerA].desc}</p>
            </div>

            <div className="pt-2 border-t border-slate-800">
              <label className="block text-slate-400 mb-1 font-medium">Peer B NAT Configuration:</label>
              <select
                value={peerB}
                onChange={(e) => setPeerB(e.target.value as NatMappingType)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
              >
                {natTypes.map((t) => (
                  <option key={t} value={t}>
                    {NAT_LABELS[t].full}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{NAT_LABELS[peerB].desc}</p>
            </div>
          </div>
        </div>

        {/* Diagnostic Assessment Card */}
        <div className="lg:col-span-7 p-4 rounded-xl bg-slate-900/50 border border-slate-800 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Connectivity Evaluation &bull; {NAT_LABELS[peerA].short} vs {NAT_LABELS[peerB].short}
                </span>
              </div>
              {evalResult && (
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                    evalResult.directP2pPossible
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {evalResult.directP2pPossible ? 'Direct P2P Feasible' : 'TURN Relay Mandatory'}
                </span>
              )}
            </div>

            {evalResult && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                    <span className="text-[10px] uppercase text-slate-500 block">Hole Punch Difficulty</span>
                    <span className={`text-sm font-bold font-mono uppercase mt-1 block ${
                      evalResult.holePunchingDifficulty === 'none'
                        ? 'text-emerald-400'
                        : evalResult.holePunchingDifficulty === 'low'
                        ? 'text-cyan-400'
                        : evalResult.holePunchingDifficulty === 'moderate'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}>
                      {evalResult.holePunchingDifficulty}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                    <span className="text-[10px] uppercase text-slate-500 block">RFC Standard Reference</span>
                    <span className="text-sm font-bold font-mono text-cyan-300 mt-1 block">
                      {evalResult.rfcReference}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-cyan-400" />
                    NAT Mapping Analysis
                  </span>
                  <p className="text-slate-400 leading-relaxed">{evalResult.explanation}</p>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Recommended Traversal Strategy
                  </span>
                  <p className="text-emerald-200/90 font-mono text-[11px] leading-relaxed">
                    {evalResult.traversalStrategy}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
