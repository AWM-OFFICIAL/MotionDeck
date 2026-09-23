import { createVideoLayer } from '../core/defaults';
import { aspectsClash, suggestedCanvas, usableDimension } from '../core/mediaLayout';
import type { MediaAsset } from '../core/types';
import { mediaSourceLabel } from '../platform/mediaImport';
import { useEditor } from '../state/editorStore';
import { openAppScreenCrop } from './AppScreenCropDialog';

/** Adds a video clip to the scene. Same path for MotionDeck recordings and file imports. */
export function placeVideoAsset(asset: MediaAsset, name?: string): string {
  const store = useEditor.getState();
  const hasVideo = store.project.scenes.some((s) => s.layers.some((l) => l.type === 'video'));
  const w = usableDimension(asset.width);
  const h = usableDimension(asset.height);
  if (!hasVideo && w && h && aspectsClash(store.project.canvas, { width: w, height: h })) {
    store.setCanvasSize(suggestedCanvas(w, h));
  }

  const duration = asset.duration > 0.2 ? asset.duration : 5;
  const layer = createVideoLayer(asset.id, { name: name ?? asset.name, duration });
  layer.trimEnd = duration;
  const source = mediaSourceLabel(asset);
  store.addLayer(layer, source === 'Imported' ? 'Add imported video' : 'Add recording');

  const portrait = w > 0 && h > 0 && w / h < 0.85;
  if (portrait || asset.recording?.source === 'import') {
    store.showToast('Tip: Crop App Screen to isolate the phone display.', 'info');
  } else {
    store.showToast('Tip: Select the clip and press A to Animate.', 'info');
  }

  // Portrait *imports* get the same crop workflow as emulator captures.
  // MotionDeck recordings are offered crop from EditorShell after save.
  if (portrait && asset.recording?.source === 'import') {
    window.setTimeout(() => openAppScreenCrop(layer.id), 350);
  }

  return layer.id;
}
