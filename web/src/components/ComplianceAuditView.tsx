import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Download, Copy, Check, FileText, Layers, RefreshCw } from 'lucide-react';

interface AuditCheckItem {
  id: string;
  name: string;
  category: 'sdp' | 'codec' | 'dtls' | 'bundle' | 'ice' | 'security';
  status: 'pass' | 'warn' | 'fail';
  score: number;
  maxScore: number;
  rfc: string;
  detail: string;
  recommendation?: string;
}

export const ComplianceAuditView: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copied, setCopied] = useState<boolean>(false);
  const [overallScore, setOverallScore] = useState<number>(94);
  const [grade, setGrade] = useState<'A' | 'B' | 'C' | 'F'>('A');

  // Audit rule items
  const [checks, setChecks] = useState<AuditCheckItem[]>([
    {
      id: 'sdp-version',
      name: 'SDP Protocol Version Specification',
      category: 'sdp',
      status: 'pass',
      score: 10,
      maxScore: 10,
      rfc: 'RFC 8866 Section 5.1',
      detail: 'v=0 header present and strictly compliant with session specification.',
    },
    {
      id: 'origin-unicast',
      name: 'Origin Unicast Address Format',
      category: 'sdp',
      status: 'pass',
      score: 10,
      maxScore: 10,
      rfc: 'RFC 8866 Section 5.2',
      detail: 'o= header specifies valid session ID, version, and network type IN IP4.',
    },
    {
      id: 'dtls-fingerprint',
      name: 'DTLS Certificate Fingerprint Verification',
      category: 'dtls',
      status: 'pass',
      score: 15,
      maxScore: 15,
      rfc: 'RFC 8842 Section 5.1',
      detail: 'SHA-256 fingerprint present with 32 colon-delimited hexadecimal octets.',
    },
    {
      id: 'dtls-role-harmony',
      name: 'DTLS Role Negotiation Harmony',
      category: 'dtls',
      status: 'pass',
      score: 15,
      maxScore: 15,
      rfc: 'RFC 8841 Section 5',
      detail: 'Offer specifies actpass and Answer correctly negotiates active/passive without collision.',
    },
    {
      id: 'rtcp-mux-check',
      name: 'RTP/RTCP Port Multiplexing (rtcp-mux)',
      category: 'bundle',
      status: 'pass',
      score: 10,
      maxScore: 10,
      rfc: 'RFC 5761 Section 5.1',
      detail: 'a=rtcp-mux enabled on both audio and video lines, conserving UDP socket allocations.',
    },
    {
      id: 'bundle-grouping',
      name: 'Media Stream BUNDLE Association',
      category: 'bundle',
      status: 'pass',
      score: 10,
      maxScore: 10,
      rfc: 'RFC 8843 Section 6',
      detail: 'a=group:BUNDLE contains all active media m-lines (audio mid:0, video mid:1).',
    },
    {
      id: 'codec-opus',
      name: 'Mandatory Audio Codec (Opus 48kHz)',
      category: 'codec',
      status: 'pass',
      score: 10,
      maxScore: 10,
      rfc: 'RFC 7587 Section 3',
      detail: 'Opus 48000/2 negotiated as primary audio payload type with dynamic PT 111.',
    },
    {
      id: 'codec-video-match',
      name: 'Video Codec Baseline Agreement',
      category: 'codec',
      status: 'pass',
      score: 10,
      maxScore: 10,
      rfc: 'RFC 7742 Section 5',
      detail: 'Both peers agree on VP8 (PT 96) and VP9 (PT 98).',
    },
    {
      id: 'ice-srflx-fallback',
      name: 'Reflexive STUN Candidate Presence',
      category: 'ice',
      status: 'pass',
      score: 10,
      maxScore: 10,
      rfc: 'RFC 8445 Section 5.1',
      detail: 'Public srflx candidate successfully gathered from STUN binding.',
    },
    {
      id: 'ice-relay-redundancy',
      name: 'TURN Relay Redundancy',
      category: 'ice',
      status: 'warn',
      score: 4,
      maxScore: 10,
      rfc: 'RFC 8656 Section 4',
      detail: 'No relay candidate present in answer description. Calls through symmetric NAT pairs will fail.',
      recommendation: 'Configure at least one TURN server URL to guarantee connectivity behind restrictive firewalls.',
    },
  ]);

  const filteredChecks = checks.filter((c) => {
    if (selectedCategory === 'all') return true;
    return c.category === selectedCategory;
  });

  const totalScore = checks.reduce((acc, c) => acc + c.score, 0);
  const maxScore = checks.reduce((acc, c) => acc + c.maxScore, 0);
  const calculatedPercent = Math.round((totalScore / maxScore) * 100);

  const downloadMarkdownReport = async () => {
    try {
      const res = await fetch('/api/audit/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: calculatedPercent,
          grade: calculatedPercent >= 90 ? 'A' : calculatedPercent >= 75 ? 'B' : 'C',
          checks,
        }),
      });
      const data = await res.json();
      const blob = new Blob([data.markdown || ''], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webrtclens-audit-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const downloadJsonReport = async () => {
    try {
      const res = await fetch('/api/audit/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: calculatedPercent,
          checks,
          timestamp: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webrtclens-audit-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const copyReportMarkdown = async () => {
    try {
      const res = await fetch('/api/audit/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: calculatedPercent,
          grade: calculatedPercent >= 90 ? 'A' : calculatedPercent >= 75 ? 'B' : 'C',
          checks,
        }),
      });
      const data = await res.json();
      await navigator.clipboard.writeText(data.markdown || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            WebRTC RFC Health &amp; Compliance Auditor
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Automated verification against IETF RFC standards: SDP, DTLS, BUNDLE, Codecs, and ICE candidates
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyReportMarkdown}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied MD' : 'Copy Report'}
          </button>

          <button
            onClick={downloadMarkdownReport}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Download .md
          </button>

          <button
            onClick={downloadJsonReport}
            className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>
        </div>
      </div>

      {/* Overall Score & Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-2xl font-bold font-mono text-emerald-400">
            {calculatedPercent >= 90 ? 'A' : calculatedPercent >= 75 ? 'B' : 'C'}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Audit Rating</span>
            <div className="text-xl font-bold text-white mt-0.5">{calculatedPercent} / 100</div>
            <span className="text-[11px] text-emerald-400 font-semibold">Production Ready</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Passing Checks</span>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {checks.filter((c) => c.status === 'pass').length} / {checks.length}
          </div>
          <span className="text-[11px] text-slate-500">100% of critical rules passed</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Warnings</span>
          <div className="text-xl font-bold text-amber-400 mt-1">
            {checks.filter((c) => c.status === 'warn').length}
          </div>
          <span className="text-[11px] text-slate-500">TURN relay recommendation</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Critical Failures</span>
          <div className="text-xl font-bold text-slate-300 mt-1">
            {checks.filter((c) => c.status === 'fail').length}
          </div>
          <span className="text-[11px] text-slate-500">Zero breaking flaws</span>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            selectedCategory === 'all'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          All Categories ({checks.length})
        </button>
        <button
          onClick={() => setSelectedCategory('sdp')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            selectedCategory === 'sdp'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          SDP Syntax
        </button>
        <button
          onClick={() => setSelectedCategory('codec')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            selectedCategory === 'codec'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          Codecs
        </button>
        <button
          onClick={() => setSelectedCategory('dtls')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            selectedCategory === 'dtls'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          DTLS Security
        </button>
        <button
          onClick={() => setSelectedCategory('bundle')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            selectedCategory === 'bundle'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          BUNDLE &amp; MUX
        </button>
        <button
          onClick={() => setSelectedCategory('ice')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${
            selectedCategory === 'ice'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          ICE Candidates
        </button>
      </div>

      {/* Compliance Checklist Table */}
      <div className="rounded-xl bg-slate-900/40 border border-slate-800 overflow-hidden">
        <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Compliance Rule Verification Catalog
          </span>
          <span className="text-xs text-slate-500 font-mono">
            {filteredChecks.length} checks displayed
          </span>
        </div>

        <div className="divide-y divide-slate-800/60">
          {filteredChecks.map((item) => (
            <div key={item.id} className="p-4 flex items-start justify-between gap-4 hover:bg-slate-800/20 transition">
              <div className="flex items-start gap-3 flex-1">
                <div className="mt-0.5 shrink-0">
                  {item.status === 'pass' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : item.status === 'warn' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400" />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{item.name}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      {item.rfc}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.detail}</p>
                  {item.recommendation && (
                    <p className="text-xs text-amber-300/90 font-medium pt-0.5">
                      Recommendation: {item.recommendation}
                    </p>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className={`text-xs font-mono font-bold ${
                  item.status === 'pass'
                    ? 'text-emerald-400'
                    : item.status === 'warn'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}>
                  +{item.score} / {item.maxScore}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
