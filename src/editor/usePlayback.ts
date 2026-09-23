/**
 * Playback clock.
 *
 * Time advances from `performance.now()` deltas rather than a frame counter, so
 * playback stays correct on 120Hz displays and when frames are dropped. The playhead
 * is written straight to the store; only components that subscribe to it re-render.
 */

import { useEffect, useRef } from 'react';
import { useEditor } from '../state/editorStore';
import type { MediaPool } from '../render/mediaPool';
import type { Scene } from '../core/types';

function activeMedia(scene: Scene, time: number) {
  const out: { assetId: string; sourceTime: number; rate: number; volume: number }[] = [];
  for (const layer of scene.layers) {
    if (layer.hidden) continue;
    const local = time - layer.start;
    if (local < 0 || local >= layer.duration) continue;
    if (layer.type === 'video') {
      out.push({
        assetId: layer.assetId,
        sourceTime: layer.trimStart + local * layer.playbackRate,
        rate: layer.playbackRate,
        volume: layer.muted ? 0 : layer.volume,
      });
    } else if (layer.type === 'audio') {
      // Fades are applied here so preview matches the exported mixdown.
      const fadeIn = layer.fadeIn > 0 ? Math.min(1, local / layer.fadeIn) : 1;
      const remaining = layer.duration - local;
      const fadeOut = layer.fadeOut > 0 ? Math.min(1, remaining / layer.fadeOut) : 1;
      out.push({
        assetId: layer.assetId,
        sourceTime: layer.trimStart + local,
        rate: 1,
        volume: layer.muted ? 0 : layer.volume * fadeIn * fadeOut,
      });
    }
  }
  return out;
}

export function usePlayback(pool: MediaPool | null) {
  const lastTick = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!pool) return;

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);

      const state = useEditor.getState();
      if (!state.isPlaying) {
        lastTick.current = now;
        return;
      }

      const dt = lastTick.current === 0 ? 0 : (now - lastTick.current) / 1000;
      lastTick.current = now;
      // A tab that was backgrounded produces a huge delta; clamp rather than jump.
      const step = Math.min(dt, 0.25);

      const duration = state.sceneDuration();
      let next = state.playhead + step;

      if (next >= duration) {
        if (state.loop) {
          next = 0;
        } else {
          useEditor.setState({ playhead: duration, isPlaying: false });
          pool.pause();
          return;
        }
      }

      useEditor.setState({ playhead: next });
      pool.play(activeMedia(state.project.scenes[state.activeSceneIndex], next));
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [pool]);

  // Pausing must stop the underlying media elements too, or audio keeps playing.
  useEffect(() => {
    if (!pool) return;
    return useEditor.subscribe((state, prev) => {
      if (state.isPlaying === prev.isPlaying) return;
      lastTick.current = 0;
      if (state.isPlaying) {
        pool.play(activeMedia(state.project.scenes[state.activeSceneIndex], state.playhead));
      } else {
        pool.pause();
      }
    });
  }, [pool]);
}
