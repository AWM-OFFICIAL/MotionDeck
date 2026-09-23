# MotionDeck architecture

MotionDeck edits a `Project` document. The canvas preview and the exporter both draw that document with `renderScene`. Media bytes live in a local vault, not inside the JSON project.

## Editor state

`src/state/editorStore.ts` holds two kinds of data:

- `project` — scenes, layers, assets, canvas size, export settings. This is undoable and autosaved.
- UI state — playhead, selection, zoom, open panels. This is not part of the file.

Undo uses Immer patches in `src/state/history.ts`. Dragging passes `transient: true` so a gesture becomes one history entry.

Projects are JSON in `localStorage` (`src/platform/projectStore.ts`). `schemaVersion` in `src/core/types.ts` is the file format. `migrateProject` upgrades older documents. Media bytes are separate, keyed by `storageKey` in OPFS (`src/platform/mediaVault.ts`), with an in-memory fallback when OPFS is missing.

## Video clip

There is one clip type: `VideoLayer` (`src/core/types.ts`).

`createVideoLayer` in `src/core/defaults.ts` is used for MotionDeck recordings and for file imports (`src/editor/placeFootage.ts`). `MediaAsset.recording.source` is `fullscreen`, `window`, `region`, or `import`. That field is a label. It does not select a different inspector, timeline, or renderer.

Imported videos with no cursor samples start with an empty `recording.cursor`. **Detect Taps**, **Mark path**, and **Add Interaction** fill that same cursor list or attach callouts. Confirming detected taps clears the inferred flag.

## Elements

Layers share `BaseLayer`: transform, opacity, motion, keyframes, lock, visibility, and optional `attachToLayerId`.

Kinds: `video`, `image`, `audio`, `text`, `shape`, `callout`, `frame`.

`attachToLayerId` keeps an overlay in the parent video’s space while the parent moves, scales, rotates, or is nested in a phone frame (`src/core/frameNest.ts`, `src/render/compositor.ts`).

## Animation

`src/core/animation.ts` evaluates entrance, idle, and exit from `MotionSpec`. Preset buttons in `src/library/motionPresets.ts` only write that spec. If a preset id has no implementation in `animation.ts`, do not expose it.

## Timeline

`src/editor/Timeline.tsx` edits `start`, `duration`, and trim on the same layer objects. Playback is `src/editor/usePlayback.ts`. Speed is `playbackRate` on the video layer; the mixer in `src/export/audioMixer.ts` uses that rate.

## Crop

`VideoLayer.crop` is a normalized rectangle. It does not rewrite the file. App Screen mode stores the same rectangle plus an optional `cropTrack` (`src/core/cropTrack.ts`) for static or template-tracked adjustments. Tracking that cannot follow the region reports a failed status instead of pretending the crop moved.

## Camera

`src/core/camera.ts` evaluates focus points in crop space or source space. Follow-cursor modes need cursor samples. Smooth Focus and manual points do not.

## Renderer and export

`src/render/compositor.ts` → `renderScene` draws one frame.

`src/render/mediaPool.ts` seeks the HTML video element. It does not decode the whole file up front.

`src/export/exporter.ts` steps the playhead and calls `renderScene`, then muxes with `mp4-muxer` or `webm-muxer`. GIF uses `src/export/gifEncoder.ts`.

## Phone frames

A `FrameLayer` can nest its linked app-screen video. The frame and the video are separate layers and can be hidden or animated separately. Nesting is `src/core/frameNest.ts`.

## Native shell

`src-tauri/src/lib.rs` exposes capability detection, cursor sampling, an always-on-top overlay flag, and `remux_video_file`. Remux only accepts MotionDeck temp files whose names start with `motiondeck-`, and it invokes FFmpeg with argument arrays (no shell). The renderer can also convert with ffmpeg.wasm (`src/platform/ffmpegWasm.ts`) when system FFmpeg is absent.

## Templates

`src/library/templates.ts` clones scene structure and applies it to the current document. The sample project is `src/library/sampleProject.ts` and is generated in memory; it does not point at a developer’s disk path.
