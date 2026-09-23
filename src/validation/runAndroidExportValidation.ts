/**
 * Headless Android app-screen export validation.
 * Driven by scripts/validate-android-export.mjs via Chrome + Vite.
 */

import {
  createFrameLayer,
  createProject,
  createTextLayer,
  createVideoLayer,
  defaultBorder,
  defaultGlow,
  defaultMotion,
} from '../core/defaults';
import { defaultAppScreen } from '../core/appScreen';
import { emptyCropTrack, upsertManualCropKeyframe } from '../core/cropTrack';
import { buildAutoTapPack, createManualTap } from '../library/autoTap';
import { MediaPool } from '../render/mediaPool';
import { renderScene } from '../render/compositor';
import { runExport } from '../export/exporter';
import { writeMedia } from '../platform/mediaVault';
import type { MediaAsset, Project } from '../core/types';
import { uid } from '../core/ids';

/** Known app-screen rect for public/fixtures/emulator-recording.mp4 (1280x720). */
export const FIXTURE_APP_CROP = {
  x: 492 / 1280,
  y: 118 / 720,
  width: 296 / 1280,
  height: 492 / 720,
};

declare global {
  interface Window {
    __MOTIONDECK_VALIDATION__?: {
      status: string;
      error?: string;
      bytes?: number;
      filename?: string;
      previewParity?: { t: number; hash: string }[];
    };
    __VALIDATION_BLOB__?: Blob;
  }
}

function setStatus(patch: Partial<NonNullable<Window['__MOTIONDECK_VALIDATION__']>>) {
  window.__MOTIONDECK_VALIDATION__ = {
    status: 'running',
    ...window.__MOTIONDECK_VALIDATION__,
    ...patch,
  };
  const el = document.getElementById('log');
  if (el) el.textContent = JSON.stringify(window.__MOTIONDECK_VALIDATION__, null, 2);
}

function canvasHash(ctx: CanvasRenderingContext2D, w: number, h: number): string {
  const data = ctx.getImageData(0, 0, Math.min(w, 64), Math.min(h, 36)).data;
  let h32 = 2166136261;
  for (let i = 0; i < data.length; i += 17) {
    h32 ^= data[i];
    h32 = Math.imul(h32, 16777619);
  }
  return (h32 >>> 0).toString(16);
}

async function fetchFixture(): Promise<Blob> {
  const res = await fetch('/fixtures/emulator-recording.mp4');
  if (!res.ok) throw new Error(`Fixture missing (${res.status})`);
  return res.blob();
}

async function buildProject(blob: Blob): Promise<{ project: Project; pool: MediaPool }> {
  const storageKey = `e2e-${uid('media')}`;
  await writeMedia(storageKey, blob);
  const asset: MediaAsset = {
    id: uid('as'),
    kind: 'video',
    name: 'emulator-recording.mp4',
    storageKey,
    mimeType: 'video/mp4',
    byteSize: blob.size,
    duration: 6,
    width: 1280,
    height: 720,
    frameRate: 30,
    createdAt: Date.now(),
    recording: {
      source: 'import',
      screen: { width: 1280, height: 720 },
      cursor: [
        { t: 1.0, x: 0.5, y: 0.42, down: true },
        { t: 3.5, x: 0.5, y: 0.62, down: true },
      ],
      cursorCaptured: true,
      hasSystemAudio: false,
      hasMicrophone: false,
      fps: 30,
    },
  };

  const project = createProject('Android E2E Validation', { width: 1280, height: 720 });
  project.assets = [asset];
  project.scenes[0].duration = 6;

  const video = createVideoLayer(asset.id, {
    name: 'App Screen',
    duration: 6,
  });
  video.crop = { ...FIXTURE_APP_CROP };
  let track = emptyCropTrack(video.crop);
  track.sourceMediaId = asset.id;
  track = upsertManualCropKeyframe(track, 0, FIXTURE_APP_CROP);
  track = upsertManualCropKeyframe(track, 3, {
    x: FIXTURE_APP_CROP.x + 3 / 1280,
    y: FIXTURE_APP_CROP.y + 2 / 720,
    width: FIXTURE_APP_CROP.width,
    height: FIXTURE_APP_CROP.height,
  });
  track = upsertManualCropKeyframe(track, 6, {
    x: FIXTURE_APP_CROP.x + 6 / 1280,
    y: FIXTURE_APP_CROP.y + 4 / 720,
    width: FIXTURE_APP_CROP.width,
    height: FIXTURE_APP_CROP.height,
  });
  track.mode = 'tracked';
  track.status = 'ready';
  track.avgConfidence = 0.9;
  track.message = 'Tracking complete · validation keyframes';
  video.appScreen = defaultAppScreen({
    enabled: true,
    mode: 'custom',
    trackingEnabled: true,
    cropTrack: track,
    shape: 'rounded',
    cornerPreset: 'android',
  });
  video.frame = { kind: 'none' };
  video.cornerRadius = 28;
  video.border = {
    ...defaultBorder(),
    enabled: true,
    style: 'solid',
    thickness: 3,
    opacity: 0.9,
    color: '#22D3EE',
  };
  video.glow = {
    ...defaultGlow(),
    enabled: true,
    intensity: 0.7,
    blur: 28,
    spread: 4,
    opacity: 0.45,
    color: '#22D3EE',
  };
  video.shadow = { enabled: true, blur: 48, y: 24, opacity: 0.45, color: '#000000', spread: 0 };
  video.motionBlur = 'medium';
  video.motion = {
    ...defaultMotion(),
    entrance: 'floatIn',
    entranceDuration: 0.7,
    idle: 'smoothZoom',
    intensity: 0.55,
  };
  video.camera = {
    mode: 'smoothFocus',
    zoom: 1.45,
    smoothing: 0.65,
    focusPoints: [
      {
        id: uid('fp'),
        time: 0.8,
        x: 0.5,
        y: 0.32,
        coordinateSpace: 'crop',
        zoom: 1.7,
        hold: 0.9,
        ramp: 0.5,
        easing: 'smooth',
      },
      {
        id: uid('fp'),
        time: 3.2,
        x: 0.5,
        y: 0.58,
        coordinateSpace: 'crop',
        zoom: 1.55,
        hold: 0.8,
        ramp: 0.45,
        easing: 'smooth',
      },
    ],
  };
  video.position = { x: 0, y: 0 };
  video.scale = 0.92;

  const frame = createFrameLayer('phoneAndroid', {
    name: 'Android Phone',
    duration: 6,
    linkedLayerId: video.id,
  });
  frame.start = 0;
  frame.position = { x: 0, y: 8 };
  frame.scale = 0.95;
  frame.linkTransforms = true;
  frame.nestAppScreen = true;
  video.position = { x: 0, y: 0 };
  video.scale = 1;
  video.rotation = 0;
  frame.motion = {
    ...defaultMotion(),
    entrance: 'slideUp',
    entranceDuration: 0.85,
    idle: 'float',
    intensity: 0.35,
  };
  frame.border = {
    ...defaultBorder(),
    enabled: true,
    style: 'soft',
    thickness: 2,
    opacity: 0.5,
    color: '#FFFFFF',
  };
  frame.glow = { ...defaultGlow(), enabled: false };
  frame.motionBlur = 'low';

  const taps = buildAutoTapPack(video, asset.recording!.cursor, 'showcase', {
    width: 320,
    height: 560,
  });
  const manual = createManualTap(video.id, { x: 40, y: 80 }, 4.2, 0);

  const title = createTextLayer('App demo', 0.4, 5);
  title.name = 'Caption';
  title.fontSize = 42;
  title.fontWeight = 600;
  title.position = { x: 0, y: -300 };
  title.motion = { ...defaultMotion(), entrance: 'fade', entranceDuration: 0.5 };

  project.scenes[0].layers = [frame, video, ...taps.layers, manual, title];
  video.camera.focusPoints = [...video.camera.focusPoints, ...taps.focusPoints];

  const pool = new MediaPool();
  pool.syncAssets(project.assets);
  await new Promise((r) => setTimeout(r, 800));

  return { project, pool };
}

/** Same fixture, but the clip is a MotionDeck window recording with cursor samples. */
async function buildRecordedProject(blob: Blob): Promise<{ project: Project; pool: MediaPool }> {
  const storageKey = `e2e-rec-${uid('media')}`;
  await writeMedia(storageKey, blob);
  const asset: MediaAsset = {
    id: uid('as'),
    kind: 'video',
    name: 'motiondeck-recording.webm',
    storageKey,
    mimeType: 'video/mp4',
    byteSize: blob.size,
    duration: 4,
    width: 1280,
    height: 720,
    frameRate: 30,
    createdAt: Date.now(),
    recording: {
      source: 'window',
      screen: { width: 1280, height: 720 },
      cursor: [
        { t: 0.4, x: 0.32, y: 0.48 },
        { t: 0.8, x: 0.48, y: 0.52, down: true, button: 0 },
        { t: 1.6, x: 0.62, y: 0.44 },
        { t: 2.4, x: 0.7, y: 0.58, down: true, button: 0 },
      ],
      cursorCaptured: true,
      hasSystemAudio: false,
      hasMicrophone: false,
      fps: 30,
    },
  };

  const project = createProject('Recorded E2E Validation', { width: 1280, height: 720 });
  project.assets = [asset];
  project.scenes[0].duration = 4;

  const video = createVideoLayer(asset.id, { name: 'Screen Recording', duration: 4 });
  video.trimEnd = 4;
  video.motion = {
    ...defaultMotion(),
    entrance: 'fade',
    entranceDuration: 0.45,
    idle: 'smoothZoom',
    intensity: 0.6,
  };
  video.shadow = { enabled: true, blur: 48, y: 20, opacity: 0.4, color: '#000000', spread: 0 };
  video.cornerRadius = 16;
  video.camera = {
    mode: 'smoothFocus',
    zoom: 1.35,
    smoothing: 0.6,
    focusPoints: [
      {
        id: uid('fp'),
        time: 1.2,
        x: 0.55,
        y: 0.48,
        coordinateSpace: 'source',
        zoom: 1.5,
        hold: 0.8,
        ramp: 0.4,
        easing: 'smooth',
      },
    ],
  };

  const title = createTextLayer('Recorded demo', 0.3, 3.2);
  title.fontSize = 42;
  title.position = { x: 0, y: -280 };
  title.motion = { ...defaultMotion(), entrance: 'fade', entranceDuration: 0.4 };

  project.scenes[0].layers = [video, title];
  const pool = new MediaPool();
  pool.syncAssets(project.assets);
  await new Promise((r) => setTimeout(r, 800));
  return { project, pool };
}

async function main() {
  const recorded = new URLSearchParams(location.search).get('mode') === 'recorded';
  setStatus({ status: 'loading-fixture' });
  try {
    const blob = await fetchFixture();
    setStatus({ status: 'building-project' });
    const { project, pool } = recorded ? await buildRecordedProject(blob) : await buildProject(blob);

    const canvas = document.createElement('canvas');
    canvas.width = project.canvas.width;
    canvas.height = project.canvas.height;
    const ctx = canvas.getContext('2d')!;
    const samples = recorded ? [0.4, 1.2, 2.4, 3.6] : [0.5, 1.5, 3.5, 5.0];
    const previewParity: { t: number; hash: string }[] = [];
    for (const t of samples) {
      ctx.fillStyle = '#0b0c0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      renderScene(ctx, project, project.scenes[0], t, pool);
      previewParity.push({ t, hash: canvasHash(ctx, canvas.width, canvas.height) });
    }
    setStatus({ status: 'exporting', previewParity });

    const result = await runExport({
      project,
      settings: {
        format: 'mp4',
        width: 1280,
        height: 720,
        fps: 30,
        bitrateMbps: 8,
        quality: 'high',
      },
      pool,
      onProgress: () => {
        setStatus({ status: 'exporting', previewParity });
      },
    });

    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename || 'motiondeck-android-e2e.mp4';
    a.id = 'download-link';
    a.textContent = 'Download';
    document.body.appendChild(a);

    window.__VALIDATION_BLOB__ = result.blob;
    setStatus({
      status: 'done',
      bytes: result.blob.size,
      filename: result.filename,
      previewParity,
    });
  } catch (err) {
    setStatus({
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

void main();
