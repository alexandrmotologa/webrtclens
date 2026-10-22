import React, { useState, useEffect } from 'react';
import { GitCompare, CheckCircle2, AlertTriangle, XCircle, ArrowRight, Layers, ShieldCheck, Copy, Check, FileText } from 'lucide-react';

interface CodecMatch {
  name: string;
  offerPayloadType: number;
  answerPayloadType: number;
  clockRate: number;
  channels?: number;
  status: 'agreed' | 'rejected' | 'remapped';
  offerParams?: Record<string, string>;
  answerParams?: Record<string, string>;
  notes?: string;
}

interface MediaDiffResult {
  mid: string;
  type: 'audio' | 'video' | 'application';
  status: 'negotiated' | 'rejected' | 'added_in_answer' | 'missing_in_answer';
  offerDirection?: string;
  answerDirection?: string;
  directionCompatible: boolean;
  dtlsOfferRole?: string;
  dtlsAnswerRole?: string;
  dtlsCompatible: boolean;
  codecs: CodecMatch[];
  commonCodecsCount: number;
  rtcpMuxNegotiated: boolean;
  bundled: boolean;
  diagnostics: Array<{
    severity: 'info' | 'warning' | 'error';
    message: string;
    rfcRef?: string;
  }>;
}

interface SdpDiffSummary {
  negotiable: boolean;
  totalOfferMedia: number;
  totalAnswerMedia: number;
  matchedMediaCount: number;
  rejectedMediaCount: number;
  bundleConfigured: boolean;
  dtlsCompatible: boolean;
  audioNegotiated: boolean;
  videoNegotiated: boolean;
  warningsCount: number;
  errorsCount: number;
}

interface SdpDiffResult {
  summary: SdpDiffSummary;
  mediaDiffs: MediaDiffResult[];
  globalDiagnostics: Array<{
    severity: 'info' | 'warning' | 'error';
    message: string;
    rfcRef?: string;
  }>;
}

export const SdpDiffStudio: React.FC = () => {
  const [samples, setSamples] = useState<any[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string>('standard-p2p');
  const [offerText, setOfferText] = useState<string>('');
  const [answerText, setAnswerText] = useState<string>('');
  const [diffResult, setDiffResult] = useState<SdpDiffResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Load samples on mount
  useEffect(() => {
    fetch('/api/sdp/samples')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSamples(data);
          const first = data[0];
          if (first) {
            setSelectedSampleId(first.id);
            setOfferText(first.offer);
            setAnswerText(first.answer);
          }
        }
      })
      .catch(() => {
        // Fallback default sample if API offline
      });
  }, []);

  // Handle sample selection
  const handleSelectSample = (sampleId: string) => {
    setSelectedSampleId(sampleId);
    const found = samples.find((s) => s.id === sampleId);
    if (found) {
      setOfferText(found.offer);
      setAnswerText(found.answer);
    }
  };

  // Run semantic diff
  const handleRunDiff = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sdp/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer: offerText, answer: answerText }),
      });
      const data = await res.json();
      if (data.diff) {
        setDiffResult(data.diff);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Run initial diff once offer/answer populated
  useEffect(() => {
    if (offerText && answerText && !diffResult) {
      handleRunDiff();
    }
  }, [offerText, answerText]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  return (
    <div className="space-y-6">
      {/* Top Control Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-cyan-400" />
            Session Description Protocol (SDP) Semantic Diff
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Decodes and compares Offer vs Answer media descriptions, codec payload maps, and DTLS roles
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {samples.length > 0 && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-slate-400 whitespace-nowrap">Preset:</span>
              <select
                value={selectedSampleId}
                onChange={(e) => handleSelectSample(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-xs rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
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
            onClick={handleRunDiff}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
          >
            <GitCompare className="w-3.5 h-3.5" />
            {loading ? 'Analyzing...' : 'Diff SDP'}
          </button>
        </div>
      </div>

      {/* Side-by-Side SDP Text Editors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Offer Box */}
        <div className="flex flex-col rounded-xl bg-slate-900/40 border border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-cyan-400">SDP OFFER</span>
              <span className="text-[11px] text-slate-500 font-mono">
                {offerText.split('\n').filter(Boolean).length} lines
              </span>
            </div>
            <button
              onClick={() => copyToClipboard(offerText, 'offer')}
              className="text-slate-400 hover:text-slate-200 transition flex items-center gap-1 text-[11px]"
            >
              {copiedField === 'offer' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedField === 'offer' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            value={offerText}
            onChange={(e) => setOfferText(e.target.value)}
            spellCheck={false}
            className="w-full h-56 p-3 bg-slate-950/70 font-mono text-[12px] text-slate-300 resize-y focus:outline-none leading-relaxed border-none"
            placeholder="Paste SDP Offer text here..."
          />
        </div>

        {/* Answer Box */}
        <div className="flex flex-col rounded-xl bg-slate-900/40 border border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-emerald-400">SDP ANSWER</span>
              <span className="text-[11px] text-slate-500 font-mono">
                {answerText.split('\n').filter(Boolean).length} lines
              </span>
            </div>
            <button
              onClick={() => copyToClipboard(answerText, 'answer')}
              className="text-slate-400 hover:text-slate-200 transition flex items-center gap-1 text-[11px]"
            >
              {copiedField === 'answer' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedField === 'answer' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            spellCheck={false}
            className="w-full h-56 p-3 bg-slate-950/70 font-mono text-[12px] text-slate-300 resize-y focus:outline-none leading-relaxed border-none"
            placeholder="Paste SDP Answer text here..."
          />
        </div>
      </div>

      {/* Diff Results View */}
      {diffResult && (
        <div className="space-y-5">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
              diffResult.summary.negotiable
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
            }`}>
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-75">Status</span>
              <div className="flex items-center gap-1.5 mt-1 font-bold text-sm">
                {diffResult.summary.negotiable ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Negotiable</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>Failed</span>
                  </>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Audio Track</span>
              <span className={`font-semibold text-sm mt-1 ${diffResult.summary.audioNegotiated ? 'text-emerald-400' : 'text-slate-500'}`}>
                {diffResult.summary.audioNegotiated ? 'Negotiated' : 'Disabled'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Video Track</span>
              <span className={`font-semibold text-sm mt-1 ${diffResult.summary.videoNegotiated ? 'text-emerald-400' : 'text-slate-500'}`}>
                {diffResult.summary.videoNegotiated ? 'Negotiated' : 'Disabled'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">BUNDLE Multiplex</span>
              <div className="flex items-center gap-1 mt-1 text-sm font-semibold">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span className={diffResult.summary.bundleConfigured ? 'text-cyan-300' : 'text-amber-400'}>
                  {diffResult.summary.bundleConfigured ? 'Active' : 'Individual'}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">DTLS Setup</span>
              <div className="flex items-center gap-1 mt-1 text-sm font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className={diffResult.summary.dtlsCompatible ? 'text-emerald-300' : 'text-rose-400'}>
                  {diffResult.summary.dtlsCompatible ? 'Compatible' : 'Conflict'}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Diagnostics</span>
              <div className="flex items-center gap-2 mt-1 text-xs font-mono">
                <span className="text-amber-400">{diffResult.summary.warningsCount} warn</span>
                <span className="text-rose-400">{diffResult.summary.errorsCount} err</span>
              </div>
            </div>
          </div>

          {/* Media Tracks Cards */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Media Stream Breakdown</h3>

            {diffResult.mediaDiffs.map((media) => (
              <div key={media.mid} className="rounded-xl bg-slate-900/50 border border-slate-800 p-4 space-y-4">
                {/* Track Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-xs font-semibold uppercase">
                      Track MID: {media.mid}
                    </span>
                    <span className="text-sm font-bold text-white capitalize">{media.type} Stream</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                      media.status === 'negotiated' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    }`}>
                      {media.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <div>
                      Direction: <span className="text-slate-200 font-mono">{media.offerDirection || 'n/a'}</span>
                      <ArrowRight className="w-3 h-3 inline mx-1 text-slate-500" />
                      <span className="text-slate-200 font-mono">{media.answerDirection || 'n/a'}</span>
                    </div>
                    <div>
                      DTLS: <span className="text-slate-200 font-mono">{media.dtlsOfferRole || 'n/a'}</span>
                      <ArrowRight className="w-3 h-3 inline mx-1 text-slate-500" />
                      <span className="text-slate-200 font-mono">{media.dtlsAnswerRole || 'n/a'}</span>
                    </div>
                  </div>
                </div>

                {/* Codecs Match Matrix */}
                {media.codecs.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Negotiated Codecs &amp; Payload Types
                    </h4>
                    <div className="overflow-x-auto rounded-lg border border-slate-800/80 bg-slate-950/60">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800 font-medium">
                          <tr>
                            <th className="py-2 px-3">Codec Name</th>
                            <th className="py-2 px-3">Offer PT</th>
                            <th className="py-2 px-3">Answer PT</th>
                            <th className="py-2 px-3">Clock Rate</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3">Parameters / Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {media.codecs.map((codec) => {
                            const isAgreed = codec.status === 'agreed';
                            const isRemapped = codec.status === 'remapped';
                            return (
                              <tr key={`${codec.name}_${codec.offerPayloadType}`} className={isAgreed ? 'bg-emerald-950/10' : ''}>
                                <td className="py-2 px-3 font-bold text-white">{codec.name}</td>
                                <td className="py-2 px-3 text-cyan-300">{codec.offerPayloadType}</td>
                                <td className="py-2 px-3 text-emerald-300">
                                  {codec.answerPayloadType !== -1 ? codec.answerPayloadType : '-'}
                                </td>
                                <td className="py-2 px-3 text-slate-400">{codec.clockRate} Hz</td>
                                <td className="py-2 px-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-sans font-bold ${
                                    isAgreed
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : isRemapped
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}>
                                    {codec.status}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-slate-400 font-sans text-xs">
                                  {codec.notes || (codec.offerParams ? Object.entries(codec.offerParams).map(([k, v]) => `${k}=${v}`).join('; ') : '-')}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Diagnostics List */}
                {media.diagnostics.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-800/60">
                    <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Diagnostics &amp; RFC Warnings
                    </h4>
                    <div className="space-y-1.5">
                      {media.diagnostics.map((diag, idx) => (
                        <div
                          key={idx}
                          className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
                            diag.severity === 'error'
                              ? 'bg-rose-950/20 border border-rose-500/30 text-rose-200'
                              : diag.severity === 'warning'
                              ? 'bg-amber-950/20 border border-amber-500/30 text-amber-200'
                              : 'bg-blue-950/20 border border-blue-500/30 text-blue-200'
                          }`}
                        >
                          {diag.severity === 'error' ? (
                            <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          ) : diag.severity === 'warning' ? (
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          ) : (
                            <FileText className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <span>{diag.message}</span>
                            {diag.rfcRef && (
                              <span className="ml-2 font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700/60 text-slate-400">
                                {diag.rfcRef}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
