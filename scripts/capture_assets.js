import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT_DIR = path.resolve('docs/images');
const FRAMES_DIR = path.resolve('docs/images/frames');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(FRAMES_DIR)) fs.mkdirSync(FRAMES_DIR, { recursive: true });

async function run() {
  console.log('Launching dedicated Chrome for WebRTCLens asset capture...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1280,820',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  let frameCount = 0;
  const captureFrame = async () => {
    frameCount++;
    const framePath = path.join(FRAMES_DIR, `frame_${String(frameCount).padStart(4, '0')}.png`);
    await page.screenshot({ path: framePath });
  };

  console.log('Navigating to http://127.0.0.1:3000...');
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1000));

  // --- 1. SDP Diff Studio ---
  console.log('Capturing Screenshot 1: SDP Diff Studio...');
  await page.screenshot({ path: path.join(OUT_DIR, 'webrtclens-1.png') });
  for (let i = 0; i < 4; i++) await captureFrame();

  // --- 2. STUN / TURN Probe Hub ---
  console.log('Switching to STUN/TURN Probe...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((x) => x.textContent?.includes('STUN / TURN Probe'));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  for (let i = 0; i < 2; i++) await captureFrame();

  console.log('Executing STUN Probe...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((x) => x.textContent?.trim() === 'STUN Probe');
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 1800));

  console.log('Capturing Screenshot 2: STUN / TURN Probe...');
  await page.screenshot({ path: path.join(OUT_DIR, 'webrtclens-2.png') });
  for (let i = 0; i < 5; i++) await captureFrame();

  // --- 3. ICE Waterfall & Topology ---
  console.log('Switching to ICE Waterfall & Topology...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((x) => x.textContent?.includes('ICE Waterfall'));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  for (let i = 0; i < 2; i++) await captureFrame();

  console.log('Gathering Local ICE Candidates...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((x) => x.textContent?.includes('Gather Local Candidates'));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 2200));

  console.log('Capturing Screenshot 3: ICE Waterfall & Topology...');
  await page.screenshot({ path: path.join(OUT_DIR, 'webrtclens-3.png') });
  for (let i = 0; i < 5; i++) await captureFrame();

  // --- 4. Media Loopback & Chaos ---
  console.log('Switching to Media Loopback & Chaos...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((x) => x.textContent?.includes('Media Loopback'));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  for (let i = 0; i < 2; i++) await captureFrame();

  console.log('Starting Media Loopback...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((x) => x.textContent?.includes('Start Media Loopback'));
    if (b) b.click();
  });

  // Adjust sliders
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="range"]');
    if (inputs[0]) {
      // Packet loss
      inputs[0].value = '15';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (inputs[1]) {
      // Latency
      inputs[1].value = '150';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // Wait 3.5s for video playback and stats to stream
  for (let k = 0; k < 6; k++) {
    await new Promise((r) => setTimeout(r, 600));
    await captureFrame();
  }

  console.log('Capturing Screenshot 4: Media Loopback & Chaos...');
  await page.screenshot({ path: path.join(OUT_DIR, 'webrtclens-4.png') });
  for (let i = 0; i < 4; i++) await captureFrame();

  await browser.close();
  console.log('All 4 high-resolution screenshots captured successfully!');

  // Generate Animated Demo GIF using FFmpeg
  console.log('Generating docs/images/webrtclens_demo.gif via FFmpeg...');
  const gifPath = path.join(OUT_DIR, 'webrtclens_demo.gif');
  const ffmpegCmd = `ffmpeg -y -framerate 4 -i "${path.join(FRAMES_DIR, 'frame_%04d.png')}" -vf "fps=4,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" "${gifPath}"`;
  execSync(ffmpegCmd, { stdio: 'inherit' });
  console.log('Generated animated demo GIF at:', gifPath);

  // Clean up temporary frame files
  const frameFiles = fs.readdirSync(FRAMES_DIR);
  for (const f of frameFiles) {
    fs.unlinkSync(path.join(FRAMES_DIR, f));
  }
  fs.rmdirSync(FRAMES_DIR);
  console.log('Cleaned up temporary frames.');
}

run().catch((err) => {
  console.error('Asset capture failed:', err);
  process.exit(1);
});
