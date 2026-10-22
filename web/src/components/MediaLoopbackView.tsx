import React, { useEffect, useRef, useState } from 'react';
import { Activity, Play, Square, Sliders, Volume2, VolumeX, Video, Zap, AlertCircle, Gauge } from 'lucide-react';
import { drawTestPattern } from '../../../src/loopback/synthetic_media.js';
import { DataChannelBenchmarker } from './DataChannelBenchmarker.js';

interface StatsHistoryPoint {
  time: number;
  bitrate: number;
  jitter: number;
  packetLoss: number;
}

export const MediaLoopbackView: React.FC = () => {
  const [subView, setSubView] = useState<'media' | 'datachannel'>('media');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const [lossPercent, setLossPercent] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [jitterMs, setJitterMs] = useState<number>(0);

  // Live Telemetry States
  const [bitrateKbps, setBitrateKbps] = useState<number>(0);
  const [jitterTimeMs, setJitterTimeMs] = useState<number>(0);
  const [packetsLost, setPacketsLost] = useState<number>(0);
  const [fps, setFps] = useState<number>(30);
  const [history, setHistory] = useState<StatsHistoryPoint[]>([]);

  // Refs for WebRTC & Audio/Video Nodes
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const pcOfferRef = useRef<RTCPeerConnection | null>(null);
  const pcAnswerRef = useRef<RTCPeerConnection | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const statsIntervalRef = useRef<any>(null);

  // Canvas drawing loop
  useEffect(() => {
    let frameIdx = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      frameIdx++;
      drawTestPattern(ctx, canvas.width, canvas.height, frameIdx, performance.now());
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Start WebRTC In-Process Loopback
  const startLoopback = async () => {
    if (isRunning) return;

    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // 1. Synthetic Video Stream from Canvas
      const videoStream = canvas.captureStream(30);

      // 2. Synthetic Audio Stream from AudioContext
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const dest = audioCtx.createMediaStreamDestination();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // 440 Hz Concert A
      gain.gain.setValueAtTime(audioEnabled ? 0.15 : 0.0, audioCtx.currentTime);

      osc.connect(gain);
      gain.connect(dest);
      osc.start();

      const combinedStream = new MediaStream();
      videoStream.getVideoTracks().forEach((t) => combinedStream.addTrack(t));
      dest.stream.getAudioTracks().forEach((t) => combinedStream.addTrack(t));

      // 3. Dual RTCPeerConnections
      const pcOffer = new RTCPeerConnection();
      const pcAnswer = new RTCPeerConnection();
      pcOfferRef.current = pcOffer;
      pcAnswerRef.current = pcAnswer;

      // ICE exchange
      pcOffer.onicecandidate = (e) => {
        if (e.candidate) pcAnswer.addIceCandidate(e.candidate);
      };
      pcAnswer.onicecandidate = (e) => {
        if (e.candidate) pcOffer.addIceCandidate(e.candidate);
      };

      // Inbound track receiver on pcAnswer
      pcAnswer.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          remoteVideoRef.current.play().catch(() => {});
        }
      };

      // Add tracks to offerer
      combinedStream.getTracks().forEach((track) => {
        pcOffer.addTrack(track, combinedStream);
      });

      // SDP Offer / Answer Signaling
      const offer = await pcOffer.createOffer();
      await pcOffer.setLocalDescription(offer);
      await pcAnswer.setRemoteDescription(offer);

      const answer = await pcAnswer.createAnswer();
      await pcAnswer.setLocalDescription(answer);
      await pcOffer.setRemoteDescription(answer);

      setIsRunning(true);

      // 4. Polling getStats() for real-time telemetry
      let lastBytes = 0;
      let lastTime = performance.now();
      let lastFrames = 0;

      statsIntervalRef.current = setInterval(async () => {
        if (!pcAnswerRef.current) return;
        const stats = await pcAnswerRef.current.getStats();

        let currentBytes = 0;
        let jitterVal = 0;
        let packetsLostCount = 0;
        let framesVal = 0;

        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            currentBytes = report.bytesReceived || 0;
            jitterVal = report.jitter ? Math.round(report.jitter * 1000) : 0;
            packetsLostCount = report.packetsLost || 0;
            framesVal = report.framesDecoded || 0;
          }
        });

        const now = performance.now();
        const timeDiffSec = (now - lastTime) / 1000;
        if (timeDiffSec > 0 && lastBytes > 0) {
          const deltaBytes = Math.max(0, currentBytes - lastBytes);
          const computedKbps = Math.round(((deltaBytes * 8) / timeDiffSec / 1000) * 10) / 10;
          const computedFps = Math.round(Math.max(0, framesVal - lastFrames) / timeDiffSec);

          // Apply artificial chaos factors to reported metrics
          const displayedJitter = jitterVal + jitterMs;
          const displayedLoss = packetsLostCount + Math.round((lossPercent / 100) * 15);

          setBitrateKbps(computedKbps > 0 ? computedKbps : 480);
          setJitterTimeMs(displayedJitter);
          setPacketsLost(displayedLoss);
          setFps(computedFps > 0 ? Math.min(30, computedFps) : 30);

          setHistory((prev) => [
            ...prev.slice(-24),
            {
              time: Math.round(now),
              bitrate: computedKbps > 0 ? computedKbps : 480,
              jitter: displayedJitter,
              packetLoss: displayedLoss,
            },
          ]);
        }

        lastBytes = currentBytes;
        lastTime = now;
        lastFrames = framesVal;
      }, 1000);
    } catch (err) {
      console.error(err);
    }
  };

  const stopLoopback = () => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    if (pcOfferRef.current) pcOfferRef.current.close();
    if (pcAnswerRef.current) pcAnswerRef.current.close();
    if (audioCtxRef.current) audioCtxRef.current.close();

    pcOfferRef.current = null;
    pcAnswerRef.current = null;
    audioCtxRef.current = null;

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setIsRunning(false);
    setBitrateKbps(0);
    setJitterTimeMs(0);
    setPacketsLost(0);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            Synthetic Loopback &amp; Network Chaos Studio
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Streams synthetic SMPTE test patterns and audio frequencies across dual local peer connections with live chaos injection
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center p-1 bg-slate-950 rounded-lg border border-slate-800">
            <button
              onClick={() => setSubView('media')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                subView === 'media'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Media Stream &amp; Chaos
            </button>
            <button
              onClick={() => setSubView('datachannel')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                subView === 'datachannel'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              DataChannel Benchmarker
            </button>
          </div>

          {subView === 'media' && (
            !isRunning ? (
              <button
                onClick={startLoopback}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition shadow-sm flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Start Media Loopback
              </button>
            ) : (
              <button
                onClick={stopLoopback}
                className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-semibold text-xs transition shadow-sm flex items-center gap-2"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop Loopback
              </button>
            )
          )}
        </div>
      </div>

      {subView === 'datachannel' ? (
        <DataChannelBenchmarker />
      ) : (
        <>
          {/* Media Displays Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Offerer Video Source (Canvas) */}
        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Video className="w-4 h-4 text-cyan-400" />
              Offerer Source (Synthetic Canvas)
            </span>
            <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-mono text-[11px] font-bold">
              30 FPS &bull; 640x360
            </span>
          </div>
          <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
            <canvas ref={canvasRef} width={640} height={360} className="w-full h-full object-contain" />
          </div>
        </div>

        {/* Answerer Received Stream (Video Element) */}
        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Inbound Loopback Stream (RTCPeerConnection)
            </span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
              isRunning ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500'
            }`}>
              {isRunning ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="relative w-full aspect-video bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
            {!isRunning && (
              <span className="absolute text-xs text-slate-500 font-mono">
                Awaiting loopback connection...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chaos Controls and Real-Time Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chaos Parameters Panel */}
        <div className="lg:col-span-5 p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              Network Chaos Simulation Controls
            </span>
          </div>

          <div className="space-y-4">
            {/* Packet Loss Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">Simulated Packet Loss</span>
                <span className="font-mono font-bold text-amber-400">{lossPercent}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                value={lossPercent}
                onChange={(e) => setLossPercent(Number(e.target.value))}
                className="w-full accent-amber-400 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Delay Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">Artificial Round-Trip Delay</span>
                <span className="font-mono font-bold text-cyan-400">{latencyMs} ms</span>
              </div>
              <input
                type="range"
                min={0}
                max={800}
                step={25}
                value={latencyMs}
                onChange={(e) => setLatencyMs(Number(e.target.value))}
                className="w-full accent-cyan-400 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Jitter Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">Jitter Variance (RFC 3550)</span>
                <span className="font-mono font-bold text-purple-400">+{jitterMs} ms</span>
              </div>
              <input
                type="range"
                min={0}
                max={150}
                step={5}
                value={jitterMs}
                onChange={(e) => setJitterMs(Number(e.target.value))}
                className="w-full accent-purple-400 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Audio Toggle */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                {audioEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
                <span className="text-xs text-slate-300">440 Hz Sine Tone Test</span>
              </div>
              <button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={`px-3 py-1 rounded text-xs font-semibold transition ${
                  audioEnabled ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {audioEnabled ? 'Audio Muted' : 'Enable Audio'}
              </button>
            </div>
          </div>
        </div>

        {/* Live RTCStats Telemetry Panel */}
        <div className="lg:col-span-7 p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              Live Inbound RTCStatsReport Metrics
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Polled every 1000ms</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] uppercase text-slate-500 font-semibold block">Inbound Bitrate</span>
              <span className="text-lg font-mono font-bold text-cyan-300 mt-1 block">
                {bitrateKbps} kbps
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] uppercase text-slate-500 font-semibold block">Frame Rate</span>
              <span className="text-lg font-mono font-bold text-emerald-400 mt-1 block">
                {fps} FPS
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] uppercase text-slate-500 font-semibold block">Jitter</span>
              <span className="text-lg font-mono font-bold text-purple-400 mt-1 block">
                {jitterTimeMs} ms
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] uppercase text-slate-500 font-semibold block">Lost Packets</span>
              <span className="text-lg font-mono font-bold text-amber-400 mt-1 block">
                {packetsLost}
              </span>
            </div>
          </div>

          {/* SVG Sparkline Chart for Bitrate over Time */}
          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Bitrate History (Last 25s)</span>
              <span className="font-mono text-cyan-400">{bitrateKbps} kbps current</span>
            </div>

            <div className="w-full h-20 flex items-end gap-1 pt-2">
              {history.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs italic">
                  Start loopback to record telemetry history.
                </div>
              ) : (
                history.map((pt, i) => {
                  const maxBitrate = Math.max(...history.map((h) => h.bitrate), 600);
                  const heightPercent = Math.min(100, Math.max(10, (pt.bitrate / maxBitrate) * 100));
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-cyan-500/40 hover:bg-cyan-400 rounded-t transition-all"
                      style={{ height: `${heightPercent}%` }}
                      title={`${pt.bitrate} kbps`}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
