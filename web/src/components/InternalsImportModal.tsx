import React, { useState } from 'react';
import { X, UploadCloud, FileCode2, Check, AlertCircle, ArrowRight } from 'lucide-react';

interface InternalsImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (offer: string, answer: string) => void;
}

export const InternalsImportModal: React.FC<InternalsImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [inputText, setInputText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<{
    offer?: string;
    answer?: string;
    iceCandidatesCount: number;
    peerConnectionId?: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleParse = async (textToParse?: string) => {
    const text = textToParse !== undefined ? textToParse : inputText;
    if (!text.trim()) {
      setErrorMsg('Please paste webrtc-internals JSON or SDP text dump first');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/sdp/import-internals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to parse dump');
      }

      const data = await res.json();
      if (!data.offer && !data.answer) {
        throw new Error('No local or remote SDP descriptions found in this dump');
      }

      setParsedData({
        offer: data.offer,
        answer: data.answer,
        iceCandidatesCount: (data.iceCandidates?.local?.length || 0) + (data.iceCandidates?.remote?.length || 0),
        peerConnectionId: data.peerConnectionId,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Error parsing webrtc-internals data');
      setParsedData(null);
    } finally {
      setLoading(false);
    }
  };

  const loadSampleInternals = () => {
    const sample = JSON.stringify(
      {
        "PeerConnection-1234": {
          "url": "https://meet.google.com/abc-defg-hij",
          "rtcStats": {},
          "updateLog": [
            {
              "type": "setLocalDescription",
              "value": "v=0\r\no=- 54321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0 1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111 9\r\nc=IN IP4 0.0.0.0\r\na=mid:0\r\na=sendrecv\r\na=rtcp-mux\r\na=rtpmap:111 opus/48000/2\r\na=setup:actpass\r\na=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF\r\nm=video 9 UDP/TLS/RTP/SAVPF 96 98\r\nc=IN IP4 0.0.0.0\r\na=mid:1\r\na=sendrecv\r\na=rtcp-mux\r\na=rtpmap:96 VP8/90000\r\na=rtpmap:98 VP9/90000\r\na=setup:actpass\r\na=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF\r\n"
            },
            {
              "type": "setRemoteDescription",
              "value": "v=0\r\no=- 98765 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0 1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nc=IN IP4 0.0.0.0\r\na=mid:0\r\na=sendrecv\r\na=rtcp-mux\r\na=rtpmap:111 opus/48000/2\r\na=setup:active\r\na=fingerprint:sha-256 FF:EE:DD:CC:BB:AA:99:88:77:66:55:44:33:22:11:00:FF:EE:DD:CC:BB:AA:99:88:77:66:55:44:33:22:11:00\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\nc=IN IP4 0.0.0.0\r\na=mid:1\r\na=sendrecv\r\na=rtcp-mux\r\na=rtpmap:96 VP8/90000\r\na=setup:active\r\na=fingerprint:sha-256 FF:EE:DD:CC:BB:AA:99:88:77:66:55:44:33:22:11:00:FF:EE:DD:CC:BB:AA:99:88:77:66:55:44:33:22:11:00\r\n"
            }
          ]
        }
      },
      null,
      2
    );

    setInputText(sample);
    handleParse(sample);
  };

  const handleApply = () => {
    if (!parsedData?.offer || !parsedData?.answer) return;
    onImport(parsedData.offer, parsedData.answer);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Import chrome://webrtc-internals Dump
              </h3>
              <p className="text-xs text-slate-400">
                Extracts setLocalDescription &amp; setRemoteDescription SDPs directly from browser diagnostic logs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Paste the JSON export downloaded from <code className="text-cyan-400 bg-slate-950 px-1 py-0.5 rounded">chrome://webrtc-internals</code> or raw console text:
            </span>
            <button
              type="button"
              onClick={loadSampleInternals}
              className="text-xs text-purple-400 hover:text-purple-300 underline font-medium"
            >
              Load Sample Meet Dump
            </button>
          </div>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={10}
            placeholder="Paste chrome://webrtc-internals JSON or plain text dump here..."
            className="w-full p-3 bg-slate-950 font-mono text-[11px] text-slate-300 rounded-xl border border-slate-800 focus:outline-none focus:border-purple-500"
          />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleParse()}
              disabled={loading || !inputText.trim()}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition disabled:opacity-50 flex items-center gap-2"
            >
              <FileCode2 className="w-4 h-4" />
              {loading ? 'Parsing Dump...' : 'Extract SDP Descriptions'}
            </button>

            {errorMsg && (
              <span className="text-xs text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {errorMsg}
              </span>
            )}
          </div>

          {/* Extracted Data Card */}
          {parsedData && (
            <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  Successfully Extracted WebRTC Session
                </span>
                {parsedData.peerConnectionId && (
                  <span className="text-[11px] font-mono text-slate-400">
                    ID: {parsedData.peerConnectionId}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-purple-500/20">
                  <span className="text-[10px] text-slate-400 uppercase block">SDP Offer</span>
                  <span className="text-xs font-mono font-bold text-emerald-400 mt-1 block">
                    {parsedData.offer ? `${parsedData.offer.split('\n').filter(Boolean).length} lines found` : 'Not found'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-purple-500/20">
                  <span className="text-[10px] text-slate-400 uppercase block">SDP Answer</span>
                  <span className="text-xs font-mono font-bold text-emerald-400 mt-1 block">
                    {parsedData.answer ? `${parsedData.answer.split('\n').filter(Boolean).length} lines found` : 'Not found'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-purple-500/20">
                  <span className="text-[10px] text-slate-400 uppercase block">Candidates</span>
                  <span className="text-xs font-mono font-bold text-cyan-400 mt-1 block">
                    {parsedData.iceCandidatesCount} discovered
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={!parsedData?.offer || !parsedData?.answer}
            className="px-5 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-slate-950 text-xs font-bold transition flex items-center gap-2 disabled:opacity-40 shadow-lg shadow-purple-500/20"
          >
            <span>Load into Diff Studio</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
