/**
 * WebRTCLens - Synthetic Media Generator Math & Canvas Utilities
 */

export interface TestPatternOptions {
  width: number;
  height: number;
  showTimestamp?: boolean;
  showColorBars?: boolean;
  showMotion?: boolean;
}

// SMPTE 75% Color Bar RGBA Definitions
export const SMPTE_COLORS = [
  '#bfbfbf', // 75% White
  '#bfbf00', // Yellow
  '#00bfbf', // Cyan
  '#00bf00', // Green
  '#bf00bf', // Magenta
  '#bf0000', // Red
  '#0000bf', // Blue
];

/**
 * Draws high-precision test pattern on an HTML Canvas context
 */
export function drawTestPattern(
  ctx: any, // CanvasRenderingContext2D in browser
  width: number,
  height: number,
  frameIndex: number,
  timeMs: number
): void {
  // 1. Background / SMPTE Color Bars
  const barWidth = width / SMPTE_COLORS.length;
  const barHeight = height * 0.7;

  for (let i = 0; i < SMPTE_COLORS.length; i++) {
    ctx.fillStyle = SMPTE_COLORS[i];
    ctx.fillRect(i * barWidth, 0, barWidth, barHeight);
  }

  // Lower bar section (Pluge pattern / black references)
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, barHeight, width, height - barHeight);

  // 2. Oscillating Motion Graphic (Bouncing circle & Lissajous curve)
  const motionT = (timeMs / 1000) * 2;
  const ballX = (Math.sin(motionT) * 0.4 + 0.5) * width;
  const ballY = (Math.cos(motionT * 1.5) * 0.3 + 0.5) * barHeight;

  ctx.beginPath();
  ctx.arc(ballX, ballY, 18, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.shadowColor = '#0284c7';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(ballX, ballY, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // 3. Digital Clock and Telemetry Overlay
  const date = new Date(timeMs);
  const timeStr = date.toISOString().slice(11, 23); // HH:mm:ss.sss

  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(16, height - 60, width - 32, 44);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(16, height - 60, width - 32, 44);

  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`UTC: ${timeStr}  |  FRAME: #${frameIndex}  |  ${width}x${height}`, 28, height - 33);
}

/**
 * Calculates sine wave sample for audio tone generator
 * @param frequency Frequency in Hz (e.g. 440 Hz for Concert A)
 * @param sampleRate Sample rate in Hz (e.g. 48000 Hz)
 * @param sampleIndex Monotonically increasing sample index
 */
export function generateSineSample(
  frequency: number,
  sampleRate: number,
  sampleIndex: number
): number {
  return Math.sin((2 * Math.PI * frequency * sampleIndex) / sampleRate);
}
