/**
 * Decoded-media pool.
 *
 * Holds one `HTMLVideoElement` per asset and keeps it in sync with the playhead.
 * During playback the element plays natively (smooth, hardware-decoded); while
 * scrubbing or exporting it is driven by precise seeks.
 */

import type { MediaAsset, VideoLayer } from '../core/types';
import type { FrameImage, FrameProvider } from './compositor';
import { getMediaUrl } from '../platform/mediaVault';

interface VideoEntry {
  el: HTMLVideoElement;
  ready: boolean;
  /** Source time we last asked for, used to avoid redundant seeks. */
  lastRequest: number;
}

export class MediaPool implements FrameProvider {
  private videos = new Map<string, VideoEntry>();
  private images = new Map<string, HTMLImageElement>();
  private audios = new Map<string, HTMLAudioElement>();
  private assets = new Map<string, MediaAsset>();
  private loading = new Set<string>();
  private playing = false;

  /** Notifies the renderer that new media finished decoding and a redraw is needed. */
  onReady?: () => void;
  /** Fired when a video reports real pixel dimensions (fixes 0×0 WebM metadata). */
  onMediaInfo?: (assetId: string, info: { width: number; height: number }) => void;

  syncAssets(assets: MediaAsset[]): void {
    this.assets = new Map(assets.map((a) => [a.id, a]));
    for (const asset of assets) void this.ensure(asset);

    const live = new Set(assets.map((a) => a.id));
    for (const [id, entry] of this.videos) {
      if (!live.has(id)) {
        entry.el.pause();
        entry.el.removeAttribute('src');
        entry.el.load();
        this.videos.delete(id);
      }
    }
    for (const id of [...this.images.keys()]) if (!live.has(id)) this.images.delete(id);
    for (const [id, el] of this.audios) {
      if (!live.has(id)) {
        el.pause();
        this.audios.delete(id);
      }
    }
  }

  getAsset(assetId: string): MediaAsset | undefined {
    return this.assets.get(assetId);
  }

  private async ensure(asset: MediaAsset): Promise<void> {
    const key = asset.id;
    if (this.loading.has(key)) return;
    if (asset.kind === 'video' && this.videos.has(key)) return;
    if (asset.kind === 'image' && this.images.has(key)) return;
    if (asset.kind === 'audio' && this.audios.has(key)) return;

    this.loading.add(key);
    try {
      const url = await getMediaUrl(asset.storageKey);
      if (!url) return;

      if (asset.kind === 'video') {
        const el = document.createElement('video');
        el.src = url;
        el.preload = 'auto';
        el.muted = true;
        el.playsInline = true;
        el.crossOrigin = 'anonymous';
        const entry: VideoEntry = { el, ready: false, lastRequest: -1 };
        this.videos.set(key, entry);
        el.addEventListener('loadeddata', () => {
          entry.ready = true;
          if (el.videoWidth >= 2 && el.videoHeight >= 2) {
            this.onMediaInfo?.(key, { width: el.videoWidth, height: el.videoHeight });
          }
          this.onReady?.();
        });
        el.load();
      } else if (asset.kind === 'image') {
        const img = new Image();
        img.src = url;
        img.decoding = 'async';
        await img.decode().catch(() => undefined);
        this.images.set(key, img);
        this.onReady?.();
      } else {
        const el = document.createElement('audio');
        el.src = url;
        el.preload = 'auto';
        this.audios.set(key, el);
      }
    } finally {
      this.loading.delete(key);
    }
  }

  getFrame(layer: VideoLayer, sourceTime: number): FrameImage | null {
    const entry = this.videos.get(layer.assetId);
    if (!entry || !entry.ready) return null;
    const el = entry.el;

    if (!this.playing) {
      // Scrub: only seek when the drift is larger than half a frame, otherwise we
      // thrash the decoder and the canvas stutters.
      if (Math.abs(el.currentTime - sourceTime) > 0.016) {
        entry.lastRequest = sourceTime;
        try {
          el.currentTime = Math.max(0, sourceTime);
        } catch {
          /* seek rejected while the element is still buffering */
        }
      }
    }
    return el.videoWidth > 0
      ? Object.assign(el, { width: el.videoWidth, height: el.videoHeight })
      : null;
  }

  getImage(assetId: string): FrameImage | null {
    const img = this.images.get(assetId);
    return img && img.complete && img.naturalWidth > 0 ? (img as unknown as FrameImage) : null;
  }

  /** Starts native playback of every video/audio element the scene needs. */
  play(active: { assetId: string; sourceTime: number; rate: number; volume: number }[]): void {
    this.playing = true;
    const activeIds = new Set(active.map((a) => a.assetId));

    for (const a of active) {
      const entry = this.videos.get(a.assetId);
      if (entry?.ready) {
        if (Math.abs(entry.el.currentTime - a.sourceTime) > 0.28) {
          entry.el.currentTime = Math.max(0, a.sourceTime);
        }
        entry.el.playbackRate = a.rate;
        entry.el.muted = a.volume <= 0;
        entry.el.volume = Math.min(1, Math.max(0, a.volume));
        void entry.el.play().catch(() => undefined);
      }
      const audio = this.audios.get(a.assetId);
      if (audio) {
        if (Math.abs(audio.currentTime - a.sourceTime) > 0.28) {
          audio.currentTime = Math.max(0, a.sourceTime);
        }
        audio.volume = Math.min(1, Math.max(0, a.volume));
        void audio.play().catch(() => undefined);
      }
    }

    for (const [id, entry] of this.videos) if (!activeIds.has(id)) entry.el.pause();
    for (const [id, el] of this.audios) if (!activeIds.has(id)) el.pause();
  }

  pause(): void {
    this.playing = false;
    for (const entry of this.videos.values()) entry.el.pause();
    for (const el of this.audios.values()) el.pause();
  }

  setVolume(assetId: string, volume: number, muted: boolean): void {
    const entry = this.videos.get(assetId);
    if (entry) {
      entry.el.volume = Math.min(1, Math.max(0, volume));
      entry.el.muted = muted;
    }
    const audio = this.audios.get(assetId);
    if (audio) {
      audio.volume = Math.min(1, Math.max(0, volume));
      audio.muted = muted;
    }
  }

  /** Seeks an element and waits for the frame to be presentable. Used by the exporter. */
  async seekExact(assetId: string, time: number): Promise<void> {
    const entry = this.videos.get(assetId);
    if (!entry) return;
    const el = entry.el;
    if (!entry.ready) {
      await new Promise<void>((resolve) => {
        const done = () => {
          el.removeEventListener('loadeddata', done);
          resolve();
        };
        el.addEventListener('loadeddata', done);
        setTimeout(done, 8000);
      });
      entry.ready = true;
    }
    if (Math.abs(el.currentTime - time) < 0.001) return;

    await new Promise<void>((resolve) => {
      const done = () => {
        el.removeEventListener('seeked', done);
        resolve();
      };
      el.addEventListener('seeked', done);
      try {
        el.currentTime = Math.max(0, Math.min(time, el.duration || time));
      } catch {
        done();
        return;
      }
      setTimeout(done, 3000);
    });
  }

  isReady(assetId: string): boolean {
    return this.videos.get(assetId)?.ready ?? this.images.has(assetId);
  }

  allReady(): boolean {
    return [...this.videos.values()].every((v) => v.ready);
  }

  dispose(): void {
    for (const entry of this.videos.values()) {
      entry.el.pause();
      entry.el.removeAttribute('src');
      entry.el.load();
    }
    for (const el of this.audios.values()) el.pause();
    this.videos.clear();
    this.images.clear();
    this.audios.clear();
  }
}
