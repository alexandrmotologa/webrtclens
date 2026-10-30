import React from 'react';
import { Radio, GitCompare, Network, Activity, BookOpen, ExternalLink, Cpu, ShieldCheck } from 'lucide-react';

export type ActiveTab = 'sdp' | 'stun_turn' | 'ice' | 'loopback' | 'audit' | 'rfc';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  serverOnline: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, serverOnline }) => {
  const tabs = [
    { id: 'sdp', shortLabel: 'SDP Diff', label: 'SDP Diff Studio', icon: GitCompare },
    { id: 'stun_turn', shortLabel: 'STUN / TURN', label: 'STUN / TURN Probe', icon: Radio },
    { id: 'ice', shortLabel: 'ICE Waterfall', label: 'ICE Waterfall & Topology', icon: Network },
    { id: 'loopback', shortLabel: 'Media Loopback', label: 'Media Loopback & Chaos', icon: Activity },
    { id: 'audit', shortLabel: 'Compliance', label: 'Compliance Audit', icon: ShieldCheck },
    { id: 'rfc', shortLabel: 'RFC Specs', label: 'RFC Dictionary', icon: BookOpen },
  ] as const;

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-[#090d16]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3 cursor-pointer shrink-0" onClick={() => setActiveTab('sdp')}>
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 shadow-inner shrink-0">
              <Cpu className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-white tracking-tight whitespace-nowrap">WebRTCLens</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 whitespace-nowrap">
                  v1.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden 2xl:block truncate">Signaling Diff, STUN/TURN Tester &amp; ICE Studio</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1 shrink-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-1.5 px-2.5 xl:px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span className="hidden xl:inline whitespace-nowrap">{tab.label}</span>
                  <span className="xl:hidden whitespace-nowrap">{tab.shortLabel}</span>
                </button>
              );
            })}
          </nav>

          {/* Server Status & Links */}
          <div className="flex items-center space-x-2.5 shrink-0">
            <div className="flex items-center space-x-2 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs shrink-0 whitespace-nowrap">
              <span className={`w-2 h-2 rounded-full shrink-0 ${serverOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span className="text-slate-400 font-mono text-[11px] whitespace-nowrap">
                {serverOnline ? 'API Active' : 'API Offline'}
              </span>
            </div>

            <a
              href="https://github.com/alexandrmotologa/webrtclens"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition shrink-0"
              title="GitHub Repository"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Mobile Tab Selector */}
      <div className="md:hidden flex overflow-x-auto no-scrollbar scroll-smooth px-3 py-2 gap-1.5 border-t border-slate-800/60 bg-slate-950/80">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                  : 'text-slate-400 bg-slate-900/60 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
