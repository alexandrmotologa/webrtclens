import React, { useState } from 'react';
import { BookOpen, Search, ExternalLink, Code2, Tag } from 'lucide-react';

interface RfcEntry {
  name: string;
  category: 'media' | 'transport' | 'security' | 'ice' | 'stun';
  rfc: string;
  rfcUrl: string;
  summary: string;
  example: string;
}

const RFC_ENTRIES: RfcEntry[] = [
  {
    name: 'a=rtpmap:<payload-type> <encoding>/<clock>[/<channels>]',
    category: 'media',
    rfc: 'RFC 8866 §6.6',
    rfcUrl: 'https://datatracker.ietf.org/doc/html/rfc8866#section-6.6',
    summary: 'Maps a dynamic or static RTP payload type number to a codec name, clock rate in Hz, and audio channels.',
    example: 'a=rtpmap:111 opus/48000/2',
  },
  {
    name: 'a=fmtp:<format> <format-specific-params>',
    category: 'media',
    rfc: 'RFC 8866 §6.7',
    rfcUrl: 'https://datatracker.ietf.org/doc/html/rfc8866#section-6.7',
    summary: 'Specifies codec-specific parameters such as profile level, packetization mode, minptime, or stereo flags.',
    example: 'a=fmtp:111 minptime=10;useinbandfec=1;stereo=1',
  },
  {
    name: 'a=fingerprint:<hash-func> <fingerprint-hash>',
    category: 'security',
    rfc: 'RFC 8122 §5',
    rfcUrl: 'https://datatracker.ietf.org/doc/html/rfc8122#section-5',
    summary: 'Provides a cryptographic digest of the certificate used for the Datagram Transport Layer Security (DTLS) connection.',
    example: 'a=fingerprint:sha-256 4A:AD:B9:B1:3F:27:5D:34:7E:9C:BC:54:60:14:E3:...',
  },
  {
    name: 'a=setup:<role>',
    category: 'security',
    rfc: 'RFC 8842 §5',
    rfcUrl: 'https://datatracker.ietf.org/doc/html/rfc8842#section-5',
    summary: 'Indicates the DTLS handshake role. In WebRTC offers, "actpass" is standard; answers return "active" (client) or "passive" (server).',
    example: 'a=setup:actpass',
  },
  {
    name: 'a=group:BUNDLE <mid> ...',
    category: 'transport',
    rfc: 'RFC 8843 §7',
    rfcUrl: 'https://datatracker.ietf.org/doc/html/rfc8843#section-7',
    summary: 'Negotiates BUNDLE multiplexing, allowing audio, video, and data channels to share a single 5-tuple UDP socket.',
    example: 'a=group:BUNDLE 0 1',
  },
  {
    name: 'a=rtcp-mux',
    category: 'transport',
    rfc: 'RFC 5761 §5.1',
    rfcUrl: 'https://datatracker.ietf.org/doc/html/rfc5761#section-5.1',
    summary: 'Instructs the transport to multiplex RTP media and RTCP control packets onto the same UDP port.',
    example: 'a=rtcp-mux',
  },
  {
    name: 'a=candidate:<foundation> <comp> <proto> <pri> <ip> <port> typ <type>',
    category: 'ice',
    rfc: 'RFC 8445 §5.1',
    rfcUrl: 'https://datatracker.ietf.org/doc/html/rfc8445#section-5.1',
    summary: 'Declares an ICE transport candidate address gathered by the agent (host, srflx, prflx, or relay).',
    example: 'a=candidate:4234997325 1 udp 2113937151 192.168.1.100 50000 typ host',
  },
  {
    name: 'a=ice-ufrag:<ufrag> & a=ice-pwd:<pwd>',
    category: 'ice',
    rfc: 'RFC 8445 §5.3',
    rfcUrl: 'https://datatracker.ietf.org/doc/html/rfc8445#section-5.3',
    summary: 'Specifies the ICE username fragment and password used for authenticating STUN connectivity check messages.',
    example: 'a=ice-ufrag:8xYz\na=ice-pwd:secretIcePassword123',
  },
  {
    name: 'XOR-MAPPED-ADDRESS (0x0020)',
    category: 'stun',
    rfc: 'RFC 5389 §15.2',
    rfcUrl: 'https://datatracker.ietf.org/doc/html/rfc5389#section-15.2',
    summary: 'STUN attribute containing the reflexive public IP address and port of the client, XORed with the STUN Magic Cookie.',
    example: 'Binary Attribute Type 0x0020 (8 bytes for IPv4, 20 bytes for IPv6)',
  },
  {
    name: 'XOR-RELAYED-ADDRESS (0x0016)',
    category: 'stun',
    rfc: 'RFC 8656 §14.5',
    rfcUrl: 'https://datatracker.ietf.org/doc/html/rfc8656#section-14.5',
    summary: 'TURN attribute allocated by the relay server. Media sent to this address is forwarded to the peer over the allocated channel.',
    example: 'Binary Attribute Type 0x0016 containing the allocated relay endpoint',
  },
  {
    name: 'MESSAGE-INTEGRITY (0x0008)',
    category: 'stun',
    rfc: 'RFC 5389 §15.4',
    rfcUrl: 'https://datatracker.ietf.org/doc/html/rfc5389#section-15.4',
    summary: 'Contains an HMAC-SHA1 signature of the STUN message using the MD5 HA1 credential key to authenticate requests and responses.',
    example: 'Binary Attribute Type 0x0008 (20 bytes HMAC digest)',
  },
];

export const RfcReferenceView: React.FC = () => {
  const [query, setQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'All Attributes' },
    { id: 'media', label: 'Media & Codecs' },
    { id: 'transport', label: 'Transport & BUNDLE' },
    { id: 'security', label: 'Security & DTLS' },
    { id: 'ice', label: 'ICE Protocol' },
    { id: 'stun', label: 'STUN & TURN' },
  ];

  const filtered = RFC_ENTRIES.filter((entry) => {
    const matchesCat = selectedCategory === 'all' || entry.category === selectedCategory;
    const matchesQuery =
      entry.name.toLowerCase().includes(query.toLowerCase()) ||
      entry.summary.toLowerCase().includes(query.toLowerCase()) ||
      entry.rfc.toLowerCase().includes(query.toLowerCase());
    return matchesCat && matchesQuery;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            WebRTC RFC &amp; Attribute Reference Dictionary
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Searchable specifications for Session Description Protocol (SDP), STUN (RFC 5389), TURN (RFC 8656), and ICE (RFC 8445)
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search attributes, RFCs..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              selectedCategory === cat.id
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Entries List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((entry, idx) => (
          <div key={idx} className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2.5 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs font-bold text-cyan-300 break-all">
                  {entry.name}
                </span>
                <a
                  href={entry.rfcUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300 hover:text-white flex items-center gap-1 shrink-0"
                  title="Open IETF RFC Document"
                >
                  <span>{entry.rfc}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mt-1.5">{entry.summary}</p>
            </div>

            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">
                Wire Example
              </span>
              <pre className="p-2 rounded bg-slate-950 font-mono text-[11px] text-slate-300 overflow-x-auto border border-slate-800/80">
                {entry.example}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
