/**
 * WebRTCLens - Command Line Interface (CLI)
 */

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';

import { parseSdp } from './sdp/parser.js';
import { diffSdp } from './sdp/diff.js';
import { mungeSdp } from './sdp/munger.js';
import { generateMarkdownAuditReport, generateJsonAuditReport } from './server/audit.js';
import { probeStun, parseStunUrl } from './stun_turn/stun_client.js';
import { probeTurn, parseTurnUrl } from './stun_turn/turn_client.js';
import { runBenchmark } from './stun_turn/benchmark.js';
import { buildServer } from './server/app.js';

const program = new Command();

program
  .name('webrtclens')
  .description('Interactive WebRTC Media & Signaling Workbench, SDP Diff Engine, STUN/TURN Tester & ICE Topology Visualizer')
  .version('1.0.0');

// Command: diff
program
  .command('diff <offerPath> <answerPath>')
  .description('Perform semantic SDP diff between Offer and Answer files')
  .option('--json', 'Output comparison as structured JSON')
  .action((offerPath, answerPath, options) => {
    try {
      const fullOfferPath = path.resolve(process.cwd(), offerPath);
      const fullAnswerPath = path.resolve(process.cwd(), answerPath);

      if (!fs.existsSync(fullOfferPath)) {
        console.error(pc.red(`Error: Offer file not found: ${fullOfferPath}`));
        process.exit(1);
      }
      if (!fs.existsSync(fullAnswerPath)) {
        console.error(pc.red(`Error: Answer file not found: ${fullAnswerPath}`));
        process.exit(1);
      }

      const offerText = fs.readFileSync(fullOfferPath, 'utf8');
      const answerText = fs.readFileSync(fullAnswerPath, 'utf8');

      const offerAst = parseSdp(offerText);
      const answerAst = parseSdp(answerText);
      const diff = diffSdp(offerAst, answerAst);

      if (options.json) {
        console.log(JSON.stringify(diff, null, 2));
        return;
      }

      console.log(pc.bold(pc.cyan('\n=== WebRTCLens SDP Semantic Diff ===\n')));
      const s = diff.summary;
      console.log(`Status:               ${s.negotiable ? pc.green(pc.bold('NEGOTIABLE')) : pc.red(pc.bold('FAILED'))}`);
      console.log(`Audio Negotiated:     ${s.audioNegotiated ? pc.green('Yes') : pc.red('No')}`);
      console.log(`Video Negotiated:     ${s.videoNegotiated ? pc.green('Yes') : pc.red('No')}`);
      console.log(`BUNDLE Multiplexing:  ${s.bundleConfigured ? pc.green('Configured') : pc.yellow('Disabled / Individual Ports')}`);
      console.log(`DTLS Compatibility:   ${s.dtlsCompatible ? pc.green('Valid') : pc.red('Role Conflict')}`);
      console.log(`Warnings / Errors:    ${pc.yellow(s.warningsCount)} warnings, ${pc.red(s.errorsCount)} errors\n`);

      console.log(pc.bold('Media Streams Breakdown:'));
      for (const m of diff.mediaDiffs) {
        const statusBadge = m.status === 'negotiated' ? pc.green('[NEGOTIATED]') : pc.red('[REJECTED]');
        console.log(`\n  ${pc.bold(`Track ${m.mid}`)} (${m.type.toUpperCase()}) ${statusBadge}`);
        console.log(`    Direction: Offer=${m.offerDirection || 'n/a'} -> Answer=${m.answerDirection || 'n/a'}`);
        console.log(`    DTLS Setup: Offer=${m.dtlsOfferRole || 'n/a'} -> Answer=${m.dtlsAnswerRole || 'n/a'}`);

        if (m.codecs.length > 0) {
          console.log('    Codecs:');
          for (const c of m.codecs) {
            let codecColor = pc.green;
            if (c.status === 'rejected') codecColor = pc.dim;
            if (c.status === 'remapped') codecColor = pc.yellow;

            const ptInfo = c.status === 'agreed'
              ? `PT ${c.offerPayloadType}`
              : c.status === 'remapped'
              ? `PT ${c.offerPayloadType} -> ${c.answerPayloadType}`
              : `PT ${c.offerPayloadType} (rejected)`;

            console.log(`      - ${codecColor(c.name.padEnd(8))} ${ptInfo} (${c.clockRate}Hz) [${c.status}]`);
          }
        }

        if (m.diagnostics.length > 0) {
          console.log('    Diagnostics:');
          for (const d of m.diagnostics) {
            const prefix = d.severity === 'error' ? pc.red('✖ ERROR') : d.severity === 'warning' ? pc.yellow('▲ WARN') : pc.blue('ℹ INFO');
            console.log(`      ${prefix}: ${d.message}`);
          }
        }
      }
      console.log('');
    } catch (err: any) {
      console.error(pc.red(`SDP Diff failed: ${err.message}`));
      process.exit(1);
    }
  });

// Command: audit
program
  .command('audit <offerPath> <answerPath>')
  .description('Generate executive Markdown / JSON audit report for CI/CD pipelines and issue trackers')
  .option('-o, --output <outputPath>', 'Save Markdown audit report to file')
  .option('--json', 'Output full report bundle as JSON')
  .option('--fail-on-warnings', 'Exit with status 1 if any warnings exist (strict CI gate)')
  .action((offerPath, answerPath, options) => {
    try {
      const fullOfferPath = path.resolve(process.cwd(), offerPath);
      const fullAnswerPath = path.resolve(process.cwd(), answerPath);

      if (!fs.existsSync(fullOfferPath) || !fs.existsSync(fullAnswerPath)) {
        console.error(pc.red('Error: Offer or Answer file not found'));
        process.exit(1);
      }

      const offerText = fs.readFileSync(fullOfferPath, 'utf8');
      const answerText = fs.readFileSync(fullAnswerPath, 'utf8');

      const offerAst = parseSdp(offerText);
      const answerAst = parseSdp(answerText);
      const diff = diffSdp(offerAst, answerAst);

      const reportData = {
        sdpDiff: diff,
        timestamp: new Date().toISOString(),
      };

      if (options.json) {
        const jsonOut = generateJsonAuditReport(reportData);
        if (options.output) {
          fs.writeFileSync(path.resolve(process.cwd(), options.output), jsonOut, 'utf8');
          console.log(pc.green(`✓ Audit JSON written to: ${options.output}`));
        } else {
          console.log(jsonOut);
        }
      } else {
        const mdOut = generateMarkdownAuditReport(reportData);
        if (options.output) {
          fs.writeFileSync(path.resolve(process.cwd(), options.output), mdOut, 'utf8');
          console.log(pc.green(`✓ Executive Markdown audit written to: ${options.output}`));
        } else {
          console.log(mdOut);
        }
      }

      // CI/CD gate checks
      if (!diff.summary.negotiable) {
        console.error(pc.red('\n[CI FAILURE] SDP negotiation failed. Incompatible codecs or DTLS role collision.'));
        process.exit(1);
      }

      if (options.failOnWarnings && diff.summary.warningsCount > 0) {
        console.error(pc.red(`\n[CI FAILURE] ${diff.summary.warningsCount} SDP warnings detected under --fail-on-warnings gate.`));
        process.exit(1);
      }
    } catch (err: any) {
      console.error(pc.red(`Audit error: ${err.message}`));
      process.exit(1);
    }
  });

// Command: probe
program
  .command('probe <url>')
  .description('Probe a STUN or TURN server (e.g. stun:stun.l.google.com:19302 or turn:relay.example.com:3478)')
  .option('-u, --user <username>', 'TURN username')
  .option('-p, --pass <password>', 'TURN password / credential')
  .option('-t, --transport <transport>', 'Transport protocol (udp, tcp, tls)', 'udp')
  .option('-c, --count <count>', 'Number of probe iterations for benchmark', '1')
  .action(async (url, options) => {
    try {
      const isTurn = url.startsWith('turn:') || url.startsWith('turns:') || options.user;
      const count = parseInt(options.count, 10) || 1;

      console.log(pc.bold(pc.cyan(`\n=== WebRTCLens ${isTurn ? 'TURN' : 'STUN'} Diagnostic Probe ===\n`)));
      console.log(`Target:      ${pc.bold(url)}`);
      console.log(`Transport:   ${options.transport.toUpperCase()}`);

      if (count > 1 && !isTurn) {
        // Run benchmark
        console.log(`Probing ${count} iterations...\n`);
        const bench = await runBenchmark({
          ...parseStunUrl(url),
          transport: options.transport as 'udp' | 'tcp',
          iterations: count,
        });

        console.log(`Results:     ${bench.successfulProbes}/${bench.sentProbes} probes succeeded (${bench.packetLossPercent}% loss)`);
        console.log(`Latency:     min=${bench.minRttMs}ms, avg=${bench.avgRttMs}ms, max=${bench.maxRttMs}ms, jitter=${bench.jitterMs}ms`);
        if (bench.mappedIp) {
          console.log(`Reflexive:   ${pc.green(`${bench.mappedIp}:${bench.mappedPort}`)}`);
        }
        console.log(`NAT Type:    ${pc.bold(bench.natType.toUpperCase())}`);
        console.log(`Summary:     ${bench.natSummary}`);
        console.log('');
        return;
      }

      if (isTurn) {
        const parsed = parseTurnUrl(url);
        const transport = (options.transport || parsed.transport) as 'udp' | 'tcp' | 'tls';

        console.log(`Initiating RFC 8656 Allocation...\n`);
        const res = await probeTurn({
          host: parsed.host,
          port: parsed.port,
          transport,
          credentials: options.user && options.pass ? { username: options.user, credential: options.pass } : undefined,
          timeoutMs: 4000,
        });

        if (res.success) {
          console.log(pc.green(pc.bold('✓ TURN Allocation Succeeded!')));
          console.log(`RTT Handshake:     ${res.rttMs}ms`);
          console.log(`Relayed Address:   ${pc.green(pc.bold(`${res.relayedAddress?.address}:${res.relayedAddress?.port}`))}`);
          if (res.mappedAddress) {
            console.log(`Reflexive Mapped:  ${res.mappedAddress.address}:${res.mappedAddress.port}`);
          }
          console.log(`Allocated Lifetime:${res.lifetime} seconds`);
          if (res.realm) console.log(`Realm:             ${res.realm}`);
          if (res.software) console.log(`Software:          ${res.software}`);
        } else {
          console.log(pc.red(pc.bold('✖ TURN Allocation Failed!')));
          console.log(`RTT:               ${res.rttMs}ms`);
          console.log(`Stage Reached:     ${res.stageReached}`);
          if (res.realm) console.log(`Realm:             ${res.realm}`);
          console.log(`Reason:            ${pc.red(res.error || 'Unknown error')}`);
        }
      } else {
        const parsed = parseStunUrl(url);
        const res = await probeStun({
          host: parsed.host,
          port: parsed.port,
          transport: options.transport as 'udp' | 'tcp',
          timeoutMs: 3000,
        });

        if (res.success) {
          console.log(pc.green(pc.bold('✓ STUN Binding Succeeded!')));
          console.log(`RTT Latency:       ${res.rttMs}ms`);
          console.log(`XOR-MAPPED-ADDR:   ${pc.green(pc.bold(`${res.mappedAddress?.address}:${res.mappedAddress?.port}`))}`);
          if (res.software) console.log(`Software:          ${res.software}`);
        } else {
          console.log(pc.red(pc.bold('✖ STUN Binding Failed!')));
          console.log(`Reason:            ${pc.red(res.error || 'Request timed out')}`);
        }
      }
      console.log('');
    } catch (err: any) {
      console.error(pc.red(`Probe error: ${err.message}`));
      process.exit(1);
    }
  });

// Command: serve
program
  .command('serve')
  .description('Start the WebRTCLens Fastify server and Web Studio')
  .option('-p, --port <port>', 'Port number to listen on', '3000')
  .option('-h, --host <host>', 'Host address to bind to', '127.0.0.1')
  .action(async (options) => {
    const port = parseInt(options.port, 10) || 3000;
    const host = options.host || '127.0.0.1';

    try {
      const server = await buildServer({ enableStatic: true });
      await server.listen({ port, host });
      console.log(pc.bold(pc.cyan('\n🚀 WebRTCLens Diagnostic Studio is running!')));
      console.log(`   Local URL:    ${pc.bold(pc.green(`http://${host}:${port}`))}`);
      console.log(`   REST API:     ${pc.bold(pc.blue(`http://${host}:${port}/api/health`))}`);
      console.log(`   Press Ctrl+C to stop the server\n`);
    } catch (err: any) {
      console.error(pc.red(`Failed to start server: ${err.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
