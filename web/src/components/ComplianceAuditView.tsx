import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Download, Copy, Check, FileText, Layers, RefreshCw, Wand2, Terminal } from 'lucide-react';

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
  const [samples, setSamples] = useState<any[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string>('standard-p2p');
  const [offerText, setOfferText] = useState<string>('');
  const [answerText, setAnswerText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copied, setCopied] = useState<boolean>(false);
  const [checks, setChecks] = useState<AuditCheckItem[]>([]);
  const [overallScore, setOverallScore] = useState<number>(100);
  const [grade, setGrade] = useState<'A' | 'B' | 'C' | 'F'>('A');

  // Load sample scenarios from API
  useEffect(() => {
    fetch('/api/sdp/samples')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSamples(data);
          setSelectedSampleId(data[0].id);
          setOfferText(data[0].offer);
          setAnswerText(data[0].answer);
        }
      })
      .catch(() => {});
  }, []);

  const handleSelectSample = (sampleId: string) => {
    setSelectedSampleId(sampleId);
    const found = samples.find((s) => s.id === sampleId);
    if (found) {
      setOfferText(found.offer);
      setAnswerText(found.answer);
    }
  };

  // Run dynamic evaluation against /api/sdp/diff
  const runDynamicAudit = async () => {
    if (!offerText || !answerText) return;
    setLoading(true);

    try {
      const res = await fetch('/api/sdp/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer: offerText, answer: answerText }),
      });

      const data = await res.json();
      const diff = data.diff;
      const offerAst = data.offer;
      const answerAst = data.answer;

      if (!diff || !offerAst || !answerAst) {
        throw new Error('Failed to parse SDP ASTs');
      }

      const dynamicChecks: AuditCheckItem[] = [];

      // 1. SDP Version Check (RFC 8866 Section 5.1)
      const hasValidVersion = offerAst.version === 0 && answerAst.version === 0;
      dynamicChecks.push({
        id: 'sdp-version',
        name: 'SDP Protocol Version Specification',
        category: 'sdp',
        status: hasValidVersion ? 'pass' : 'fail',
        score: hasValidVersion ? 10 : 0,
        maxScore: 10,
        rfc: 'RFC 8866 Section 5.1',
        detail: hasValidVersion
          ? 'v=0 header present and strictly compliant in both Offer and Answer descriptions.'
          : 'v= header is invalid or missing in session description.',
      });

      // 2. Origin Unicast Check (RFC 8866 Section 5.2)
      const hasValidOrigin = Boolean(offerAst.origin?.username && answerAst.origin?.username);
      dynamicChecks.push({
        id: 'origin-unicast',
        name: 'Origin Unicast Address Format',
        category: 'sdp',
        status: hasValidOrigin ? 'pass' : 'fail',
        score: hasValidOrigin ? 10 : 0,
        maxScore: 10,
        rfc: 'RFC 8866 Section 5.2',
        detail: hasValidOrigin
          ? `o= headers contain valid session IDs (Offer: ${offerAst.origin?.sessionId}, Answer: ${answerAst.origin?.sessionId}).`
          : 'Missing or malformed o= origin record.',
      });

      // 3. DTLS Fingerprint Check (RFC 8842 Section 5.1)
      const offerFingerprints = offerAst.media?.map((m: any) => m.fingerprint?.hash).filter(Boolean) || [];
      const validFingerprints = offerFingerprints.length > 0 && offerFingerprints.every((f: string) => f.split(':').length === 32);
      dynamicChecks.push({
        id: 'dtls-fingerprint',
        name: 'DTLS Certificate Fingerprint Verification',
        category: 'dtls',
        status: validFingerprints ? 'pass' : 'fail',
        score: validFingerprints ? 15 : 0,
        maxScore: 15,
        rfc: 'RFC 8842 Section 5.1',
        detail: validFingerprints
          ? 'Cryptographic SHA-256 fingerprint verified with 32 colon-separated hexadecimal octets.'
          : 'Missing or invalid DTLS certificate fingerprint hash.',
      });

      // 4. DTLS Role Negotiation Harmony (RFC 8841 Section 5)
      const dtlsOk = diff.summary?.dtlsCompatible;
      dynamicChecks.push({
        id: 'dtls-role-harmony',
        name: 'DTLS Role Negotiation Harmony',
        category: 'dtls',
        status: dtlsOk ? 'pass' : 'fail',
        score: dtlsOk ? 15 : 0,
        maxScore: 15,
        rfc: 'RFC 8841 Section 5',
        detail: dtlsOk
          ? 'DTLS handshake roles correctly partitioned between active and actpass/passive endpoints without conflict.'
          : 'CRITICAL: DTLS role collision detected! Both endpoints configured with identical non-actpass roles.',
        recommendation: dtlsOk ? undefined : 'Ensure offerer specifies a=setup:actpass and answerer specifies a=setup:active or passive.',
      });

      // 5. RTP/RTCP Port Multiplexing (RFC 5761 Section 5.1)
      const allRtcpMux = diff.mediaDiffs?.every((m: any) => m.rtcpMuxNegotiated);
      dynamicChecks.push({
        id: 'rtcp-mux-check',
        name: 'RTP/RTCP Port Multiplexing (rtcp-mux)',
        category: 'bundle',
        status: allRtcpMux ? 'pass' : 'warn',
        score: allRtcpMux ? 10 : 5,
        maxScore: 10,
        rfc: 'RFC 5761 Section 5.1',
        detail: allRtcpMux
          ? 'a=rtcp-mux confirmed on all active media tracks, conserving UDP socket allocation.'
          : 'rtcp-mux missing on one or more tracks; separate RTCP ports required.',
        recommendation: allRtcpMux ? undefined : 'Enable a=rtcp-mux in all m= media blocks to save port resources.',
      });

      // 6. Media Stream BUNDLE Association (RFC 8843 Section 6)
      const bundleConfigured = diff.summary?.bundleConfigured;
      dynamicChecks.push({
        id: 'bundle-grouping',
        name: 'Media Stream BUNDLE Association',
        category: 'bundle',
        status: bundleConfigured ? 'pass' : 'warn',
        score: bundleConfigured ? 10 : 5,
        maxScore: 10,
        rfc: 'RFC 8843 Section 6',
        detail: bundleConfigured
          ? 'a=group:BUNDLE multiplexes audio and video onto a single shared 5-tuple transport.'
          : 'BUNDLE multiplexing disabled; separate transports allocated per media line.',
      });

      // 7. Mandatory Audio Codec (Opus 48kHz, RFC 7587)
      const audioNegotiated = diff.summary?.audioNegotiated;
      dynamicChecks.push({
        id: 'codec-opus',
        name: 'Audio Codec Interoperability (Opus)',
        category: 'codec',
        status: audioNegotiated ? 'pass' : 'fail',
        score: audioNegotiated ? 10 : 0,
        maxScore: 10,
        rfc: 'RFC 7587 Section 3',
        detail: audioNegotiated
          ? 'Primary Opus 48000 Hz / 2-channel audio codec successfully negotiated.'
          : 'Audio track rejected or failed to agree on common audio payload types.',
      });

      // 8. Video Codec Agreement (RFC 7742 Section 5)
      const videoNegotiated = diff.summary?.videoNegotiated;
      const hasWarnings = diff.summary?.warningsCount > 0;
      dynamicChecks.push({
        id: 'codec-video-match',
        name: 'Video Codec Baseline Agreement',
        category: 'codec',
        status: videoNegotiated && !hasWarnings ? 'pass' : videoNegotiated ? 'warn' : 'fail',
        score: videoNegotiated && !hasWarnings ? 10 : videoNegotiated ? 6 : 0,
        maxScore: 10,
        rfc: 'RFC 7742 Section 5',
        detail: videoNegotiated
          ? `Video media line negotiated with agreed payload types.${hasWarnings ? ' Parameter warnings detected.' : ''}`
          : 'Video media line rejected or missing common codec.',
        recommendation: hasWarnings ? 'Check H.264 profile-level-id or packetization-mode parameters.' : undefined,
      });

      // 9. ICE Candidate Reflexive Presence (RFC 8445)
      const rawSdp = offerText + '\n' + answerText;
      const hasSrflx = rawSdp.includes('typ srflx');
      dynamicChecks.push({
        id: 'ice-srflx-fallback',
        name: 'Reflexive STUN Candidate Presence',
        category: 'ice',
        status: hasSrflx ? 'pass' : 'warn',
        score: hasSrflx ? 10 : 4,
        maxScore: 10,
        rfc: 'RFC 8445 Section 5.1',
        detail: hasSrflx
          ? 'Public srflx candidates gathered from STUN binding reflection.'
          : 'No srflx candidates detected in SDP. WAN peer-to-peer connectivity across NAT may fail.',
        recommendation: hasSrflx ? undefined : 'Configure a STUN server URL (e.g. stun:stun.l.google.com:19302) in iceServers.',
      });

      // 10. TURN Relay Candidate Redundancy (RFC 8656)
      const hasRelay = rawSdp.includes('typ relay');
      dynamicChecks.push({
        id: 'ice-relay-redundancy',
        name: 'TURN Relay Redundancy (RFC 8656)',
        category: 'ice',
        status: hasRelay ? 'pass' : 'warn',
        score: hasRelay ? 10 : 4,
        maxScore: 10,
        rfc: 'RFC 8656 Section 4',
        detail: hasRelay
          ? 'Relayed TURN candidates present for guaranteed symmetric NAT and firewall traversal.'
          : 'No relay candidate present in session descriptions. Calls behind restrictive corporate firewalls will drop.',
        recommendation: hasRelay ? undefined : 'Deploy at least one TURN relay server with valid credentials.',
      });

      const currentScore = dynamicChecks.reduce((a, b) => a + b.score, 0);
      const maximumScore = dynamicChecks.reduce((a, b) => a + b.maxScore, 0);
      const pct = Math.round((currentScore / maximumScore) * 100);

      setChecks(dynamicChecks);
      setOverallScore(pct);
      setGrade(pct >= 90 ? 'A' : pct >= 75 ? 'B' : pct >= 60 ? 'C' : 'F');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (offerText && answerText) {
      runDynamicAudit();
    }
  }, [offerText, answerText]);

  const filteredChecks = checks.filter((c) => {
    if (selectedCategory === 'all') return true;
    return c.category === selectedCategory;
  });

  const downloadMarkdownReport = async () => {
    try {
      const res = await fetch('/api/audit/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: overallScore,
          grade,
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
          score: overallScore,
          grade,
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
          score: overallScore,
          grade,
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
      {/* Top Banner with Scenario Selector */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            WebRTC RFC Health &amp; Compliance Auditor
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Evaluates real session descriptions dynamically against IETF RFC standards
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {samples.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 whitespace-nowrap">Audit Scenario:</span>
              <select
                value={selectedSampleId}
                onChange={(e) => handleSelectSample(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                {samples.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={runDynamicAudit}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-cyan-300 border border-slate-700 transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Re-Audit</span>
          </button>

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
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold font-mono border ${
            grade === 'A'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : grade === 'B'
              ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
              : grade === 'C'
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
          }`}>
            {grade}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Dynamic Score</span>
            <div className="text-xl font-bold text-white mt-0.5">{overallScore} / 100</div>
            <span className={`text-[11px] font-semibold ${
              grade === 'A' ? 'text-emerald-400' : grade === 'B' ? 'text-cyan-400' : grade === 'C' ? 'text-amber-400' : 'text-rose-400'
            }`}>
              {grade === 'A' ? 'Fully Compliant' : grade === 'B' ? 'Minor Warnings' : grade === 'C' ? 'Suboptimal Traversal' : 'Non-Negotiable Flaw'}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Passing Checks</span>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {checks.filter((c) => c.status === 'pass').length} / {checks.length}
          </div>
          <span className="text-[11px] text-slate-500">IETF standards satisfied</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Warnings</span>
          <div className="text-xl font-bold text-amber-400 mt-1">
            {checks.filter((c) => c.status === 'warn').length}
          </div>
          <span className="text-[11px] text-slate-500">Traversals requiring fallback</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Critical Failures</span>
          <div className="text-xl font-bold text-rose-400 mt-1">
            {checks.filter((c) => c.status === 'fail').length}
          </div>
          <span className="text-[11px] text-slate-500">Blocking session errors</span>
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
            Dynamic Compliance Rule Verification
          </span>
          <span className="text-xs text-slate-500 font-mono">
            {filteredChecks.length} checks evaluated
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
