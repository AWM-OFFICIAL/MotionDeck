/**
 * Long-recording stress soak: build looped fixtures and re-validate export.
 * Usage: node scripts/stress-soak.mjs
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIX = join(ROOT, 'public', 'fixtures');
const OUT = join(FIX, 'validation-out');
const SRC = join(FIX, 'emulator-recording.mp4');
const CHROME =
  process.env.CHROME_PATH ||
  [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find((p) => existsSync(p));

mkdirSync(OUT, { recursive: true });

function loopFixture(seconds, outName) {
  const dest = join(FIX, outName);
  if (existsSync(dest)) {
    console.log('reuse', dest);
    return dest;
  }
  console.log('building', outName, `(${seconds}s)`);
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-stream_loop',
      '-1',
      '-i',
      SRC,
      '-t',
      String(seconds),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-an',
      dest,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.error(r.stderr);
    throw new Error('ffmpeg loop failed');
  }
  return dest;
}

async function waitForServer(url, attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error('server not up');
}

if (!existsSync(SRC)) {
  console.error('Missing emulator-recording.mp4 — run scripts/make-emulator-fixture.py first');
  process.exit(1);
}

const five = loopFixture(300, 'emulator-recording-5m.mp4');
const ten = loopFixture(600, 'emulator-recording-10m.mp4');

writeFileSync(
  join(OUT, 'soak-fixtures.json'),
  JSON.stringify(
    { fiveMin: five, tenMin: ten, fiveBytes: statSync(five).size, tenBytes: statSync(ten).size },
    null,
    2,
  ),
);

for (const f of [five, ten]) {
  const p = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', f],
    { encoding: 'utf8' },
  );
  console.log(f, p.stdout);
}

const PORT = '1420';
const BASE = `http://localhost:${PORT}`;
let vite = null;
let viteLog = '';
try {
  const res = await fetch(`${BASE}/validation.html`);
  if (!res.ok) throw new Error('down');
  console.log('Reusing Vite');
} catch {
  vite = spawn('npx', ['vite', '--port', PORT, '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, BROWSER: 'none' },
  });
  vite.stdout.on('data', (d) => (viteLog += d.toString()));
  vite.stderr.on('data', (d) => (viteLog += d.toString()));
}

const shutdown = () => {
  try {
    vite?.kill();
  } catch {
    /* */
  }
};
process.on('exit', shutdown);

await waitForServer(`${BASE}/validation.html`);

const require = createRequire(join(ROOT, 'scripts', 'stress-soak.mjs'));
const puppeteer = require('puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.setDefaultTimeout(300_000);
page.on('console', (msg) => console.log('[browser]', msg.text()));

await page.goto(`${BASE}/validation.html`, { waitUntil: 'networkidle0' });
await page.waitForFunction(
  () =>
    window.__MOTIONDECK_VALIDATION__?.status === 'done' ||
    window.__MOTIONDECK_VALIDATION__?.status === 'failed',
  { timeout: 240_000 },
);
const status = await page.evaluate(() => window.__MOTIONDECK_VALIDATION__);
writeFileSync(join(OUT, 'soak-report.json'), JSON.stringify({ status, five, ten }, null, 2));
console.log('SOAK_REPORT', JSON.stringify({ status: status?.status, bytes: status?.bytes }, null, 2));

await browser.close();
shutdown();

if (status?.status !== 'done') {
  console.error('Soak base export failed', status);
  console.error(viteLog.slice(-2000));
  process.exit(1);
}
console.log('STRESS_SOAK_OK');
