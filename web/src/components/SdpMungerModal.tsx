import React, { useState } from 'react';
import { X, Sliders, Check, RefreshCw, Wand2, Shield, Radio, Flame } from 'lucide-react';

interface SdpMungerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetTitle: 'Offer' | 'Answer';
  initialSdp: string;
  onApply: (mungedSdp: string) => void;
}

export const SdpMungerModal: React.FC<SdpMungerModalProps> = ({
  isOpen,
  onClose,
  targetTitle,
  initialSdp,
  onApply,
}) => {
  const [preferredVideoCodec, setPreferredVideoCodec] = useState<string>('auto');
  const [preferredAudioCodec, setPreferredAudioCodec] = useState<string>('auto');
  const [stripH264, setStripH264] = useState<boolean>(false);
  const [stripVp8, setStripVp8] = useState<boolean>(false);
  const [stripVp9, setStripVp9] = useState<boolean>(false);
  const [stripAv1, setStripAv1] = useState<boolean>(false);
  const [stripUlpfec, setStripUlpfec] = useState<boolean>(false);
  const [stripRed, setStripRed] = useState<boolean>(false);
  const [videoBitrate, setVideoBitrate] = useState<number>(0);
  const [audioBitrate, setAudioBitrate] = useState<number>(0);
  const [dtlsRole, setDtlsRole] = useState<'unchanged' | 'actpass' | 'active' | 'passive'>('unchanged');
  const [forceOpusStereo, setForceOpusStereo] = useState<boolean>(false);
  const [stripBundle, setStripBundle] = useState<boolean>(false);
  const [previewSdp, setPreviewSdp] = useState<string>(initialSdp);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [appliedNotification, setAppliedNotification] = useState<boolean>(false);

  if (!isOpen) return null;

  const buildOptions = () => {
    const stripCodecs: string[] = [];
    if (stripH264) stripCodecs.push('H264');
    if (stripVp8) stripCodecs.push('VP8');
    if (stripVp9) stripCodecs.push('VP9');
    if (stripAv1) stripCodecs.push('AV1');
    if (stripUlpfec) stripCodecs.push('ulpfec');
    if (stripRed) stripCodecs.push('red');

    return {
      stripCodecs: stripCodecs.length > 0 ? stripCodecs : undefined,
      preferVideoCodec: preferredVideoCodec !== 'auto' ? preferredVideoCodec : undefined,
      preferAudioCodec: preferredAudioCodec !== 'auto' ? preferredAudioCodec : undefined,
      setVideoBitrateKbps: videoBitrate > 0 ? videoBitrate : undefined,
      setAudioBitrateKbps: audioBitrate > 0 ? audioBitrate : undefined,
      setDtlsSetup: dtlsRole !== 'unchanged' ? dtlsRole : undefined,
      forceOpusStereo: forceOpusStereo ? true : undefined,
      stripBundle: stripBundle ? true : undefined,
    };
  };

  const handleComputePreview = async () => {
    setPreviewLoading(true);
    try {
      const opts = buildOptions();
      const res = await fetch('/api/sdp/munge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: initialSdp, options: opts }),
      });
      const data = await res.json();
      if (data.sdp) {
        setPreviewSdp(data.sdp);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const applyPreset = (preset: 'force_h264' | 'force_vp9' | 'audio_only' | 'hd_video' | 'invert_dtls') => {
    if (preset === 'force_h264') {
      setPreferredVideoCodec('H264');
      setStripVp8(true);
      setStripVp9(true);
      setStripAv1(true);
    } else if (preset === 'force_vp9') {
      setPreferredVideoCodec('VP9');
      setStripH264(true);
      setStripVp8(true);
      setStripAv1(true);
    } else if (preset === 'audio_only') {
      setStripH264(true);
      setStripVp8(true);
      setStripVp9(true);
      setStripAv1(true);
      setVideoBitrate(0);
    } else if (preset === 'hd_video') {
      setVideoBitrate(4500);
      setPreferredVideoCodec('VP9');
      setForceOpusStereo(true);
    } else if (preset === 'invert_dtls') {
      setDtlsRole('active');
    }
  };

  const handleCommit = () => {
    onApply(previewSdp);
    setAppliedNotification(true);
    setTimeout(() => {
      setAppliedNotification(false);
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                SDP Munger &amp; Modifier &bull; {targetTitle}
              </h3>
              <p className="text-xs text-slate-400">
                Dynamically strip codecs, reorder payload preferences, inject bandwidth limits, or invert DTLS roles
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Presets */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Quick Simulation Presets
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPreset('force_h264')}
                className="px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition"
              >
                Force H.264 Baseline
              </button>
              <button
                type="button"
                onClick={() => applyPreset('force_vp9')}
                className="px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition"
              >
                Force VP9 Profile
              </button>
              <button
                type="button"
                onClick={() => applyPreset('audio_only')}
                className="px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition"
              >
                Strip All Video (Audio-Only)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('hd_video')}
                className="px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition"
              >
                4.5 Mbps HD Video + Stereo Opus
              </button>
              <button
                type="button"
                onClick={() => applyPreset('invert_dtls')}
                className="px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition"
              >
                Invert DTLS to Active (Client)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Codec Stripping & Preference */}
            <div className="space-y-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                Codec Selection &amp; Ordering
              </h4>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Preferred Video Codec (m= Line First PT):</label>
                  <select
                    value={preferredVideoCodec}
                    onChange={(e) => setPreferredVideoCodec(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                  >
                    <option value="auto">Unchanged (Original Priority)</option>
                    <option value="H264">H264</option>
                    <option value="VP8">VP8</option>
                    <option value="VP9">VP9</option>
                    <option value="AV1">AV1</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Preferred Audio Codec:</label>
                  <select
                    value={preferredAudioCodec}
                    onChange={(e) => setPreferredAudioCodec(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                  >
                    <option value="auto">Unchanged</option>
                    <option value="opus">opus</option>
                    <option value="PCMU">PCMU (G.711u)</option>
                    <option value="PCMA">PCMA (G.711a)</option>
                  </select>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <label className="block text-slate-400 mb-2">Strip Unwanted Codecs from SDP:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stripH264}
                        onChange={(e) => setStripH264(e.target.checked)}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                      />
                      <span>Drop H264</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stripVp8}
                        onChange={(e) => setStripVp8(e.target.checked)}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                      />
                      <span>Drop VP8</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stripVp9}
                        onChange={(e) => setStripVp9(e.target.checked)}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                      />
                      <span>Drop VP9</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stripAv1}
                        onChange={(e) => setStripAv1(e.target.checked)}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                      />
                      <span>Drop AV1</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stripRed}
                        onChange={(e) => setStripRed(e.target.checked)}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                      />
                      <span>Drop RED</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stripUlpfec}
                        onChange={(e) => setStripUlpfec(e.target.checked)}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                      />
                      <span>Drop ULPFEC</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Bitrate & DTLS & BUNDLE */}
            <div className="space-y-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Bandwidth, DTLS &amp; Transport
              </h4>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">
                    Video Bitrate Limit (b=AS / b=TIAS kbps, 0 = unset):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="250"
                    value={videoBitrate}
                    onChange={(e) => setVideoBitrate(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 font-mono"
                    placeholder="e.g. 2500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Audio Bitrate Limit (kbps, 0 = unset):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="16"
                    value={audioBitrate}
                    onChange={(e) => setAudioBitrate(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 font-mono"
                    placeholder="e.g. 128"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">DTLS Role (a=setup):</label>
                  <select
                    value={dtlsRole}
                    onChange={(e) => setDtlsRole(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                  >
                    <option value="unchanged">Keep Original</option>
                    <option value="actpass">actpass (Offer standard)</option>
                    <option value="active">active (Client role)</option>
                    <option value="passive">passive (Server role)</option>
                  </select>
                </div>

                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={forceOpusStereo}
                      onChange={(e) => setForceOpusStereo(e.target.checked)}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                    />
                    <span>Force Opus Stereo (stereo=1; sprop-stereo=1)</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stripBundle}
                      onChange={(e) => setStripBundle(e.target.checked)}
                      className="rounded border-slate-700 text-rose-500 focus:ring-0"
                    />
                    <span className="text-rose-300">Disable BUNDLE multiplexing (RFC 8843)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={handleComputePreview}
              disabled={previewLoading}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold transition flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${previewLoading ? 'animate-spin' : ''}`} />
              Compute Munged SDP Preview
            </button>

            <span className="text-xs text-slate-500 font-mono">
              Preview size: {previewSdp.split('\n').filter(Boolean).length} lines
            </span>
          </div>

          {/* Preview Box */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-400">Transformed SDP Preview:</span>
            <textarea
              readOnly
              value={previewSdp}
              rows={8}
              className="w-full p-3 bg-slate-950 font-mono text-[11px] text-slate-300 rounded-xl border border-slate-800 resize-y focus:outline-none"
            />
          </div>
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
            onClick={handleCommit}
            className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-cyan-500/20"
          >
            {appliedNotification ? <Check className="w-4 h-4 text-slate-950" /> : <Wand2 className="w-4 h-4" />}
            {appliedNotification ? 'Applied to Editor!' : `Apply Munged SDP to ${targetTitle}`}
          </button>
        </div>
      </div>
    </div>
  );
};
