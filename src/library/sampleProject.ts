/**
 * Bundled demo project.
 *
 * Generates a short synthetic "app recording" on a canvas — a fake dashboard with a
 * pointer moving between two buttons — and builds a full composition around it. That
 * makes every feature (camera focus from clicks, cursor effects, text animation,
 * transitions) explorable on first launch without the user recording anything.
 *
 * It is flagged `isSample` everywhere so it can never be confused with real work.
 */

import { createProject, createScene, createTextLayer, createVideoLayer, defaultShadow } from '../core/defaults';
import { uid } from '../core/ids';
import type { CursorEvent, MediaAsset, Project } from '../core/types';
import { importMedia } from '../platform/mediaImport';

const WIDTH = 1280;
const HEIGHT = 800;
const FPS = 30;
const DURATION = 8;

/** Where the synthetic pointer travels, in normalised coordinates. */
const WAYPOINTS: { t: number; x: number; y: number; click?: boolean }[] = [
  { t: 0, x: 0.12, y: 0.2 },
  { t: 1.4, x: 0.26, y: 0.38 },
  { t: 1.7, x: 0.26, y: 0.38, click: true },
  { t: 3.2, x: 0.72, y: 0.31 },
  { t: 3.5, x: 0.72, y: 0.31, click: true },
  { t: 5.1, x: 0.5, y: 0.72 },
  { t: 5.4, x: 0.5, y: 0.72, click: true },
  { t: 7.0, x: 0.84, y: 0.5 },
  { t: 7.3, x: 0.84, y: 0.5, click: true },
  { t: 8.0, x: 0.6, y: 0.4 },
];

function pointerAt(t: number): { x: number; y: number } {
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const a = WAYPOINTS[i];
    const b = WAYPOINTS[i + 1];
    if (t >= a.t && t <= b.t) {
      const p = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      // Ease so the synthetic pointer moves the way a hand does.
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    }
  }
  const last = WAYPOINTS[WAYPOINTS.length - 1];
  return { x: last.x, y: last.y };
}

function buildCursorLog(): CursorEvent[] {
  const events: CursorEvent[] = [];
  for (let t = 0; t <= DURATION; t += 1 / 60) {
    const p = pointerAt(t);
    events.push({ t: Number(t.toFixed(4)), x: p.x, y: p.y });
  }
  for (const wp of WAYPOINTS) {
    if (wp.click) events.push({ t: wp.t, x: wp.x, y: wp.y, down: true, button: 1 });
  }
  return events.sort((a, b) => a.t - b.t);
}

/* ------------------------------------------------------ synthetic footage */

function drawDashboard(ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = '#0F1115';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Sidebar
  ctx.fillStyle = '#15181D';
  ctx.fillRect(0, 0, 208, HEIGHT);
  ctx.fillStyle = '#22D3EE';
  roundRect(ctx, 22, 24, 26, 26, 7);
  ctx.fill();
  ctx.fillStyle = '#E6E8EB';
  ctx.font = '600 15px Inter, system-ui, sans-serif';
  ctx.fillText('Acme', 58, 42);

  const items = ['Overview', 'Projects', 'Analytics', 'Team', 'Settings'];
  items.forEach((item, i) => {
    const y = 96 + i * 44;
    const hovered = i === 1 && t > 1.3 && t < 3.1;
    if (hovered) {
      ctx.fillStyle = 'rgba(34,211,238,0.12)';
      roundRect(ctx, 14, y - 18, 180, 34, 7);
      ctx.fill();
    }
    ctx.fillStyle = hovered ? '#22D3EE' : '#8A9099';
    ctx.font = '500 13.5px Inter, system-ui, sans-serif';
    ctx.fillText(item, 40, y + 4);
    ctx.fillStyle = hovered ? '#22D3EE' : '#4A5058';
    roundRect(ctx, 20, y - 8, 13, 13, 3.5);
    ctx.fill();
  });

  // Header
  ctx.fillStyle = '#E6E8EB';
  ctx.font = '700 26px Inter, system-ui, sans-serif';
  ctx.fillText('Overview', 248, 68);
  ctx.fillStyle = '#6B7280';
  ctx.font = '400 13px Inter, system-ui, sans-serif';
  ctx.fillText('Everything happening across your workspace', 248, 92);

  // Primary button that the pointer "clicks" at 3.5s
  const pressed = t > 3.4 && t < 3.75;
  ctx.fillStyle = pressed ? '#0EA5B8' : '#22D3EE';
  roundRect(ctx, 856, 44, 152, 38, 9);
  ctx.fill();
  ctx.fillStyle = '#04262C';
  ctx.font = '600 13.5px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('New Project', 932, 68);
  ctx.textAlign = 'left';

  // Metric cards
  const metrics = [
    { label: 'Active users', value: 12480, suffix: '', accent: '#22D3EE' },
    { label: 'Conversion', value: 4.8, suffix: '%', accent: '#34D399' },
    { label: 'Revenue', value: 92400, suffix: '', accent: '#A78BFA' },
  ];
  metrics.forEach((m, i) => {
    const x = 248 + i * 258;
    ctx.fillStyle = '#15181D';
    roundRect(ctx, x, 126, 238, 112, 11);
    ctx.fill();
    ctx.strokeStyle = '#212429';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#6B7280';
    ctx.font = '500 12px Inter, system-ui, sans-serif';
    ctx.fillText(m.label, x + 18, 156);

    // Values count up so the footage has genuine motion.
    const progress = Math.min(1, t / 2.4);
    const shown = m.value * (0.55 + 0.45 * progress);
    ctx.fillStyle = '#F4F5F7';
    ctx.font = '700 28px Inter, system-ui, sans-serif';
    ctx.fillText(
      m.suffix ? `${shown.toFixed(1)}${m.suffix}` : Math.round(shown).toLocaleString('en-US'),
      x + 18,
      196,
    );

    ctx.fillStyle = m.accent;
    ctx.font = '500 11.5px Inter, system-ui, sans-serif';
    ctx.fillText('▲ 12.4% this week', x + 18, 220);
  });

  // Chart
  ctx.fillStyle = '#15181D';
  roundRect(ctx, 248, 262, 754, 300, 11);
  ctx.fill();
  ctx.strokeStyle = '#212429';
  ctx.stroke();

  ctx.fillStyle = '#9CA3AF';
  ctx.font = '600 13.5px Inter, system-ui, sans-serif';
  ctx.fillText('Weekly activity', 274, 292);

  ctx.beginPath();
  for (let i = 0; i <= 72; i++) {
    const px = 274 + (i / 72) * 700;
    const wave =
      Math.sin(i * 0.22 + t * 0.9) * 32 + Math.sin(i * 0.07 + t * 0.4) * 46 + Math.sin(i * 0.5) * 8;
    const py = 440 - wave - 40;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = '#22D3EE';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.lineTo(974, 532);
  ctx.lineTo(274, 532);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, 300, 0, 532);
  fill.addColorStop(0, 'rgba(34,211,238,0.22)');
  fill.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = fill;
  ctx.fill();

  // Footer row the pointer clicks at 5.4s
  const rowActive = t > 5.3 && t < 5.8;
  ctx.fillStyle = rowActive ? '#1B2026' : '#15181D';
  roundRect(ctx, 248, 586, 754, 64, 11);
  ctx.fill();
  ctx.fillStyle = '#E6E8EB';
  ctx.font = '500 13.5px Inter, system-ui, sans-serif';
  ctx.fillText('Export this report', 274, 624);
  ctx.fillStyle = '#6B7280';
  ctx.font = '400 12px Inter, system-ui, sans-serif';
  ctx.fillText('CSV, PDF or share a live link', 430, 624);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Records the synthetic dashboard to a real video blob via `captureStream`. */
async function renderSampleFootage(): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function') return null;

  const mime = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm'].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
  if (!mime) return null;

  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  recorder.start();

  // Drive the animation in real time so MediaRecorder produces correct timestamps.
  const startedAt = performance.now();
  await new Promise<void>((resolve) => {
    const step = () => {
      const t = (performance.now() - startedAt) / 1000;
      if (t >= DURATION) {
        resolve();
        return;
      }
      drawDashboard(ctx, t);
      requestAnimationFrame(step);
    };
    step();
  });

  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  return done;
}

export interface SampleBuildResult {
  project: Project;
  /** False when the browser could not produce footage; the layout still loads. */
  hasFootage: boolean;
}

export async function buildSampleProject(): Promise<SampleBuildResult> {
  const project = createProject('Example App Demo', { width: 1920, height: 1080 });
  project.isSample = true;
  project.id = 'sample-project';

  let asset: MediaAsset | null = null;
  try {
    const blob = await renderSampleFootage();
    if (blob && blob.size > 1000) {
      asset = await importMedia(blob, {
        name: 'Sample dashboard recording',
        mimeType: blob.type,
        fps: FPS,
        recording: {
          source: 'window',
          screen: { width: WIDTH, height: HEIGHT },
          cursor: buildCursorLog(),
          cursorCaptured: true,
          hasSystemAudio: false,
          hasMicrophone: false,
          fps: FPS,
        },
      });
      // captureStream timing drifts slightly; trust our own duration.
      asset = { ...asset, duration: asset.duration > 1 ? asset.duration : DURATION, width: WIDTH, height: HEIGHT };
      project.assets.push(asset);
    }
  } catch (err) {
    console.warn('[MotionDeck] sample footage could not be generated', err);
  }

  /* ------------------------------------------------------------ scenes */

  const intro = createScene('Intro', 2.4);
  intro.background = { type: 'gradient', from: '#1B2735', to: '#0B0F14', angle: 135 };
  intro.transitionIn = { kind: 'fade', duration: 0.5 };
  const introTitle = createTextLayer('Introducing Acme', 0, 2.4);
  introTitle.fontSize = 108;
  introTitle.motion = {
    entrance: 'blurIn',
    entranceDuration: 0.9,
    exit: 'scaleDown',
    exitDuration: 0.5,
    idle: 'smoothZoom',
    intensity: 0.35,
    feel: 'cinematic',
  };
  intro.layers.push(introTitle);

  const demo = createScene('Product demo', asset ? Math.max(asset.duration, DURATION) : DURATION);
  demo.background = { type: 'mesh', colors: ['#0B0F14', '#14304F', '#0F766E', '#312E81'], seed: 11 };
  demo.transitionIn = { kind: 'fade', duration: 0.45 };

  if (asset) {
    const clip = createVideoLayer(asset.id, { name: 'Screen Recording', duration: asset.duration });
    clip.trimEnd = asset.duration;
    clip.frame = { kind: 'browserDark', url: 'app.acme.com' };
    clip.cornerRadius = 12;
    clip.shadow = { ...defaultShadow(), blur: 130, y: 44, opacity: 0.55 };
    clip.position = { x: 0, y: 40 };
    clip.motion = {
      entrance: 'scale',
      entranceDuration: 0.8,
      exit: 'fade',
      exitDuration: 0.5,
      idle: 'none',
      intensity: 1,
      feel: 'smooth',
    };
    clip.cursor = {
      style: 'softCircle',
      size: 1.1,
      smoothing: 0.6,
      shadow: true,
      highlightColor: '#FFE066',
      highlightRadius: 50,
      click: 'ripple',
      clickColor: '#22D3EE',
    };
    // Pre-built focus points so the automatic camera is visible immediately.
    clip.camera = {
      mode: 'smoothFocus',
      zoom: 1.7,
      smoothing: 0.6,
      focusPoints: WAYPOINTS.filter((w) => w.click).map((w) => ({
        id: uid('fp'),
        time: Math.max(0, w.t - 0.4),
        x: w.x,
        y: w.y,
        zoom: 1.75,
        hold: 0.9,
        ramp: 0.65,
        easing: 'smooth' as const,
        auto: true,
      })),
    };
    demo.layers.push(clip);
  }

  const caption = createTextLayer('Built for speed', 0.4, 2.8);
  caption.fontSize = 62;
  caption.position = { x: 0, y: -430 };
  caption.animation = 'wordReveal';
  caption.motion = {
    entrance: 'slideUp',
    entranceDuration: 0.7,
    exit: 'fade',
    exitDuration: 0.5,
    idle: 'none',
    intensity: 1,
    feel: 'smooth',
  };
  demo.layers.push(caption);

  const outro = createScene('Call to action', 3);
  outro.background = { type: 'solid', color: '#06070A' };
  outro.transitionIn = { kind: 'zoom', duration: 0.6 };
  const cta = createTextLayer('Try it free today', 0, 3);
  cta.fontSize = 92;
  cta.motion = {
    entrance: 'pop',
    entranceDuration: 0.6,
    exit: 'fade',
    exitDuration: 0.8,
    idle: 'float',
    intensity: 0.5,
    feel: 'smooth',
  };
  outro.layers.push(cta);

  project.scenes = [intro, demo, outro];
  project.updatedAt = Date.now();

  return { project, hasFootage: asset !== null };
}
