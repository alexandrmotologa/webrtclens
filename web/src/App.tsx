import React, { useState, useEffect } from 'react';
import { Navbar, type ActiveTab } from './components/Navbar.js';
import { SdpDiffStudio } from './components/SdpDiffStudio.js';
import { StunTurnProbeHub } from './components/StunTurnProbeHub.js';
import { IceWaterfallView } from './components/IceWaterfallView.js';
import { MediaLoopbackView } from './components/MediaLoopbackView.js';
import { RfcReferenceView } from './components/RfcReferenceView.js';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('sdp');
  const [serverOnline, setServerOnline] = useState<boolean>(false);

  // Poll server health status
  useEffect(() => {
    const checkHealth = () => {
      fetch('/api/health')
        .then((res) => {
          if (res.ok) setServerOnline(true);
          else setServerOnline(false);
        })
        .catch(() => setServerOnline(false));
    };

    checkHealth();
    const timer = setInterval(checkHealth, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 font-sans">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} serverOnline={serverOnline} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'sdp' && <SdpDiffStudio />}
        {activeTab === 'stun_turn' && <StunTurnProbeHub />}
        {activeTab === 'ice' && <IceWaterfallView />}
        {activeTab === 'loopback' && <MediaLoopbackView />}
        {activeTab === 'rfc' && <RfcReferenceView />}
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-950/60 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-300">WebRTCLens</span>
            <span>&bull;</span>
            <span>WebRTC Diagnostic Workbench and Testing Studio</span>
          </div>

          <div className="flex items-center space-x-4 text-[11px]">
            <a
              href="https://github.com/alexandrmotologa/webrtclens"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300 transition"
            >
              GitHub Source
            </a>
            <span>&bull;</span>
            <a
              href="https://datatracker.ietf.org/doc/html/rfc8866"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300 transition"
            >
              RFC 8866 SDP
            </a>
            <span>&bull;</span>
            <a
              href="https://datatracker.ietf.org/doc/html/rfc8656"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300 transition"
            >
              RFC 8656 TURN
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
