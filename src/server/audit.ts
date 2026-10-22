/**
 * WebRTCLens - Executive Diagnostic Audit Report Generator (Markdown & JSON)
 */

import type { SdpDiffResult } from '../sdp/types.js';
import type { BenchmarkReport } from '../stun_turn/benchmark.js';
import type { IceDiagnosticReport } from '../ice/diagnostics.js';

export interface AuditReportData {
  sdpDiff?: SdpDiffResult;
  stunBenchmark?: BenchmarkReport;
  iceDiagnostics?: IceDiagnosticReport;
  timestamp?: string;
  projectName?: string;
}

export function generateMarkdownAuditReport(data: AuditReportData): string {
  const timestamp = data.timestamp || new Date().toISOString();
  const lines: string[] = [];

  lines.push('# WebRTCLens Diagnostic Audit Report');
  lines.push('');
  lines.push(`> Generated at: \`${timestamp}\` | Engine: WebRTCLens v1.0.0`);
  lines.push('');

  // 1. Executive Summary Table
  lines.push('## 1. Executive Summary');
  lines.push('');
  lines.push('| Metric | Status | Evaluation |');
  lines.push('|---|---|---|');

  if (data.sdpDiff) {
    const s = data.sdpDiff.summary;
    lines.push(`| **Signaling Negotiation** | ${s.negotiable ? 'PASSED' : 'FAILED'} | Audio: ${s.audioNegotiated ? 'Yes' : 'No'}, Video: ${s.videoNegotiated ? 'Yes' : 'No'} |`);
    lines.push(`| **BUNDLE Multiplexing** | ${s.bundleConfigured ? 'ENABLED' : 'INDIVIDUAL PORTS'} | ${s.bundleConfigured ? 'Shared 5-tuple transport' : 'Multiple UDP sockets required'} |`);
    lines.push(`| **DTLS Setup Handshake** | ${s.dtlsCompatible ? 'VALID' : 'ROLE CONFLICT'} | ${s.dtlsCompatible ? 'Client/Server roles aligned' : 'Critical role collision detected'} |`);
  }

  if (data.stunBenchmark) {
    const b = data.stunBenchmark;
    lines.push(`| **STUN NAT Traversal** | ${b.packetLossPercent === 0 ? 'HEALTHY' : 'DEGRADED'} | Loss: ${b.packetLossPercent}%, Avg RTT: ${b.avgRttMs}ms, Jitter: ${b.jitterMs}ms |`);
    lines.push(`| **NAT Mapping Type** | \`${b.natType.toUpperCase()}\` | ${b.natSummary} |`);
  }

  if (data.iceDiagnostics) {
    const ice = data.iceDiagnostics;
    lines.push(`| **ICE Health Score** | **${ice.healthScore} / 100** | Status: ${ice.status.toUpperCase()} |`);
  }

  lines.push('');

  // 2. Codec Negotiation Matrix
  if (data.sdpDiff && data.sdpDiff.mediaDiffs.length > 0) {
    lines.push('## 2. Negotiated Codecs & Payload Types');
    lines.push('');
    for (const m of data.sdpDiff.mediaDiffs) {
      lines.push(`### Track \`${m.mid}\` (${m.type.toUpperCase()}) - Status: ${m.status.toUpperCase()}`);
      lines.push('');
      lines.push('| Codec | Offer PT | Answer PT | Clock Rate | Status | Notes |');
      lines.push('|---|---|---|---|---|---|');
      for (const c of m.codecs) {
        const answerPt = c.answerPayloadType !== -1 ? String(c.answerPayloadType) : '-';
        lines.push(`| **${c.name}** | ${c.offerPayloadType} | ${answerPt} | ${c.clockRate} Hz | \`${c.status.toUpperCase()}\` | ${c.notes || '-'} |`);
      }
      lines.push('');
    }
  }

  // 3. Diagnostics & Warning Details
  const allDiagnostics: Array<{ severity: string; message: string; rfc?: string }> = [];

  if (data.sdpDiff) {
    for (const m of data.sdpDiff.mediaDiffs) {
      for (const d of m.diagnostics) {
        allDiagnostics.push({ severity: d.severity.toUpperCase(), message: d.message, rfc: d.rfcRef });
      }
    }
    for (const d of data.sdpDiff.globalDiagnostics) {
      allDiagnostics.push({ severity: d.severity.toUpperCase(), message: d.message, rfc: d.rfcRef });
    }
  }

  if (data.iceDiagnostics) {
    for (const issue of data.iceDiagnostics.issues) {
      allDiagnostics.push({
        severity: issue.severity.toUpperCase(),
        message: `${issue.title}: ${issue.explanation} Remediation: ${issue.remediation}`,
      });
    }
  }

  if (allDiagnostics.length > 0) {
    lines.push('## 3. Diagnostic Findings & Warnings');
    lines.push('');
    for (const item of allDiagnostics) {
      const badge = item.severity === 'ERROR' || item.severity === 'CRITICAL' ? 'CRITICAL' : item.severity;
      const rfcInfo = item.rfc ? ` (Ref: \`${item.rfc}\`)` : '';
      lines.push(`- **[${badge}]** ${item.message}${rfcInfo}`);
    }
    lines.push('');
  }

  // 4. Engineering Recommendations
  lines.push('## 4. Engineering Recommendations');
  lines.push('');
  if (data.stunBenchmark && data.stunBenchmark.recommendations.length > 0) {
    for (const rec of data.stunBenchmark.recommendations) {
      lines.push(`1. ${rec}`);
    }
  } else {
    lines.push('1. Ensure STUN and TURN servers are configured in `iceServers` with TLS fallback (port 5349).');
    lines.push('2. Maintain matching H.264 profile-level-id parameters between mobile and web clients.');
    lines.push('3. Monitor realtime `getStats()` jitter buffers when packet loss exceeds 2%.');
  }
  lines.push('');

  return lines.join('\n');
}

export function generateJsonAuditReport(data: AuditReportData): string {
  return JSON.stringify(
    {
      generator: 'WebRTCLens',
      version: '1.0.0',
      timestamp: data.timestamp || new Date().toISOString(),
      ...data,
    },
    null,
    2
  );
}
