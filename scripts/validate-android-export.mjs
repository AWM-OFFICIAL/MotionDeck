/**
 * Launch Vite + system Chrome, run Android export validation, save MP4 + inspect it.
 *
 * Usage: node scripts/validate-android-export.mjs
 */

import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'fixtures', 'validation-out');
const CHROME =
  process.env.CHROME_PATH ||
  [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find((p) => existsSync(p));

if (!CHROME) {
  console.error('No Chrome/Edge found.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const PORT = process.env.MOTIONDECK_PORT || '1420';
const BASE = `http://localhost:${PORT}`;
const SKIP_VITE = process.env.SKIP_VITE === '1';
const RECORDED = process.argv.includes('--recorded');
const PAGE = RECORDED ? '/validation.html?mode=recorded' : '/validation.html';
const MP4_NAME = RECORDED ? 'recorded-clip-export.mp4' : 'android-app-screen-export.mp4';

async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error('Vite server did not start');
}

async function ensurePuppeteer() {
  const require = createRequire(join(ROOT, 'scripts', 'validate-android-export.mjs'));
  try {
    return require('puppeteer-core');
  } catch {
    console.log('Installing puppeteer-core…');
    await new Promise((resolve, reject) => {
      const child = spawn('npm', ['install', '--no-save', 'puppeteer-core@24'], {
        cwd: ROOT,
        stdio: 'inherit',
        shell: true,
      });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('npm install failed'))));
    });
    return createRequire(join(ROOT, 'scripts', 'validate-android-export.mjs'))('puppeteer-core');
  }
}

let vite = null;
let viteLog = '';

if (!SKIP_VITE) {
  // Probe first — reuse an already-running Moti onDeck/Vite if present.
  let alreadyUp = false;
  try {
    const res = await fetch(`${BASE}/validation.html`);
    alreadyUp = res.ok;
  } catch {
    alreadyUp = false;
  }

  if (!alreadyUp) {
    vite = spawn('npx', ['vite', '--port', PORT, '--strictPort'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, BROWSER: 'none' },
    });
    vite.stdout.on('data', (d) => {
      viteLog += d.toString();
    });
    vite.stderr.on('data', (d) => {
      viteLog += d.toString();
    });
  } else {
    console.log('Reusing existing Vite on', BASE);
  }
}

const shutdown = () => {
  if (!vite) return;
  try {
    vite.kill();
  } catch {
    /* ignore */
  }
};
process.on('exit', shutdown);
process.on('SIGINT', () => {
  shutdown();
  process.exit(130);
});

try {
  await waitForServer(`${BASE}/validation.html`);
  const puppeteer = await ensurePuppeteer();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-features=WebCodecs',
    ],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);

  page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.error('[pageerror]', err.message));

  await page.goto(`${BASE}${PAGE}`, { waitUntil: 'networkidle0' });

  await page.waitForFunction(
    () => {
      const s = window.__MOTIONDECK_VALIDATION__;
      return s && (s.status === 'done' || s.status === 'failed');
    },
    { timeout: 180_000 },
  );

  const status = await page.evaluate(() => window.__MOTIONDECK_VALIDATION__);
  writeFileSync(join(OUT_DIR, 'validation-status.json'), JSON.stringify(status, null, 2));

  if (status?.status !== 'done') {
    console.error('Validation failed:', status);
    console.error('Vite log tail:\n', viteLog.slice(-2000));
    await browser.close();
    process.exit(1);
  }

  const buffer = await page.evaluate(async () => {
    const blob = window.__VALIDATION_BLOB__;
    if (!blob) return null;
    const ab = await blob.arrayBuffer();
    return Array.from(new Uint8Array(ab));
  });

  if (!buffer || buffer.length < 1000) {
    console.error('No MP4 blob produced');
    await browser.close();
    process.exit(1);
  }

  const mp4Path = join(OUT_DIR, MP4_NAME);
  writeFileSync(mp4Path, Buffer.from(buffer));
  console.log('Wrote', mp4Path, `(${buffer.length} bytes)`);

  await browser.close();

  const { spawnSync } = await import('node:child_process');
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration,size,bit_rate',
      '-show_entries',
      'stream=codec_name,width,height,r_frame_rate,nb_frames',
      '-of',
      'json',
      mp4Path,
    ],
    { encoding: 'utf8' },
  );
  const probeName = RECORDED ? 'ffprobe-recorded.json' : 'ffprobe.json';
  writeFileSync(join(OUT_DIR, probeName), probe.stdout || probe.stderr || '{}');
  console.log(probe.stdout);

  const stillTimes = RECORDED ? ['0.4', '1.2', '2.4', '3.6'] : ['0.5', '1.5', '3.5', '5.0'];
  const stillPrefix = RECORDED ? 'recorded-frame-t' : 'frame-t';
  for (const t of stillTimes) {
    const still = join(OUT_DIR, `${stillPrefix}${t.replace('.', '_')}.png`);
    spawnSync('ffmpeg', ['-y', '-ss', t, '-i', mp4Path, '-frames:v', '1', still], {
      encoding: 'utf8',
    });
    console.log('still', still, existsSync(still) ? 'ok' : 'MISSING');
  }

  console.log('VALIDATION_OK');
  process.exit(0);
} catch (err) {
  console.error(err);
  console.error('Vite log:\n', viteLog.slice(-3000));
  process.exit(1);
} finally {
  shutdown();
}
