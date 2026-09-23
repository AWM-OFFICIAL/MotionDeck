/**
 * Recording workflow.
 *
 * Pre-flight options, then a minimal floating control bar during capture. Options the
 * current platform cannot honour are disabled with a reason rather than silently
 * ignored.
 */

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  RecordingError,
  ScreenRecorder,
  listAudioInputs,
  listVideoInputs,
  primeDevicePermissions,
  type CaptureSource,
  type DeviceOption,
  type RecordingOptions,
  type RecordingResult,
} from '../platform/recorder';
import { detectCapabilities, type Capabilities } from '../platform/env';
import { Button, Dialog, Field, Segmented, Select, StatusPill, Toggle, Tooltip } from '../ui/primitives';
import { IconAlert, IconMic, IconMonitor, IconRecord, IconRegion, IconStop, IconWindow } from '../ui/icons';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: (result: RecordingResult) => void;
}

const SOURCES: { id: CaptureSource; label: string; icon: typeof IconMonitor; hint: string }[] = [
  { id: 'fullscreen', label: 'Full Screen', icon: IconMonitor, hint: 'Capture an entire display.' },
  { id: 'window', label: 'Window', icon: IconWindow, hint: 'Capture one application window.' },
  { id: 'region', label: 'Region', icon: IconRegion, hint: 'Capture a screen, then crop it in the editor.' },
];

export function RecordDialog({ open, onClose, onComplete }: Props) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [mics, setMics] = useState<DeviceOption[]>([]);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [error, setError] = useState<{ message: string; hint: string } | null>(null);
  const [starting, setStarting] = useState(false);

  const [options, setOptions] = useState<RecordingOptions>({
    source: 'fullscreen',
    fps: 30,
    resolution: 1080,
    systemAudio: false,
    microphoneId: null,
    cameraId: null,
    showCursor: true,
  });

  const recorderRef = useRef<ScreenRecorder | null>(null);
  const [activeRecorder, setActiveRecorder] = useState<ScreenRecorder | null>(null);

  useEffect(() => {
    if (!open) return;
    void detectCapabilities().then(setCaps);
    void listAudioInputs().then(setMics);
    void listVideoInputs().then(setCameras);
  }, [open]);

  const start = async () => {
    setError(null);
    setStarting(true);
    const recorder = new ScreenRecorder();
    recorderRef.current = recorder;
    recorder.onExternalStop = () => void stop();

    try {
      await recorder.start(options);
      setActiveRecorder(recorder);
      onClose();
    } catch (err) {
      recorderRef.current = null;
      setActiveRecorder(null);
      if (err instanceof RecordingError) setError({ message: err.message, hint: err.hint });
      else setError({ message: 'Recording could not start.', hint: 'Try again, or pick a different source.' });
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    try {
      const result = await recorder.stop();
      onComplete(result);
    } catch (err) {
      console.error('[MotionDeck] stop failed', err);
    } finally {
      recorderRef.current = null;
      setActiveRecorder(null);
    }
  };

  const cancel = () => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setActiveRecorder(null);
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Record your screen"
        description="Nothing leaves your machine. Recordings are stored locally until you export."
        width={600}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              icon={<IconRecord size={15} />}
              onClick={start}
              disabled={starting || !caps?.screenCapture}
            >
              {starting ? 'Starting…' : 'Start Recording'}
            </Button>
          </>
        }
      >
        {caps && !caps.screenCapture && (
          <div className="mb-4 flex gap-2.5 rounded-[8px] border border-[#5c2a2e] bg-[#2a1416] px-3 py-2.5">
            <IconAlert size={16} className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
            <div>
              <p className="text-[12.5px] font-medium text-[var(--color-danger)]">
                Screen capture is not available here.
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--color-ink-300)]">
                Use the MotionDeck desktop app, or open this in a Chromium-based browser. You can
                still import an existing recording.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 flex gap-2.5 rounded-[8px] border border-[#5c2a2e] bg-[#2a1416] px-3 py-2.5">
            <IconAlert size={16} className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
            <div>
              <p className="text-[12.5px] font-medium text-[var(--color-danger)]">{error.message}</p>
              <p className="mt-0.5 text-[11.5px] text-[var(--color-ink-300)]">{error.hint}</p>
            </div>
          </div>
        )}

        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[11px] font-medium tracking-wide text-[var(--color-ink-300)]">Record</p>
            <div className="grid grid-cols-3 gap-2">
              {SOURCES.map(({ id, label, icon: Icon, hint }) => (
                <Tooltip key={id} content={hint}>
                  <button
                    type="button"
                    onClick={() => setOptions((o) => ({ ...o, source: id }))}
                    className={clsx(
                      'flex flex-col items-center gap-1.5 rounded-[9px] border px-3 py-3.5 transition-colors',
                      options.source === id
                        ? 'border-[var(--color-accent)] bg-[rgba(34,211,238,0.08)] text-[var(--color-accent)]'
                        : 'border-[var(--color-ink-700)] text-[var(--color-ink-300)] hover:border-[var(--color-ink-500)] hover:text-[var(--color-ink-100)]',
                    )}
                  >
                    <Icon size={20} />
                    <span className="text-[12px] font-medium">{label}</span>
                  </button>
                </Tooltip>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-ink-500)]">
              Your operating system shows the picker next — choose the exact screen or window there.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <Field label="Frame rate">
              <Segmented
                size="sm"
                value={String(options.fps)}
                options={[
                  { id: '30', label: '30 FPS' },
                  { id: '60', label: '60 FPS' },
                ]}
                onChange={(v) => setOptions((o) => ({ ...o, fps: Number(v) as 30 | 60 }))}
              />
            </Field>

            <Field label="Resolution">
              <Select
                value={String(options.resolution)}
                options={[
                  { id: '720', label: '720p' },
                  { id: '1080', label: '1080p' },
                  { id: '1440', label: '1440p' },
                  { id: 'native', label: 'Native' },
                ]}
                onChange={(v) =>
                  setOptions((o) => ({
                    ...o,
                    resolution: v === 'native' ? 'native' : (Number(v) as 720 | 1080 | 1440),
                  }))
                }
              />
            </Field>

            <Field label="Microphone">
              <Select
                value={options.microphoneId ?? 'off'}
                options={[
                  { id: 'off', label: 'Off' },
                  ...mics.map((m) => ({ id: m.id, label: m.label })),
                ]}
                onChange={async (id) => {
                  if (id !== 'off' && mics.length > 0 && !mics[0].label.trim()) {
                    await primeDevicePermissions();
                    setMics(await listAudioInputs());
                  }
                  setOptions((o) => ({ ...o, microphoneId: id === 'off' ? null : id }));
                }}
              />
              {mics.length === 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    await primeDevicePermissions();
                    setMics(await listAudioInputs());
                  }}
                  className="mt-1 text-[11px] text-[var(--color-accent)] hover:opacity-80"
                >
                  <IconMic size={11} className="mr-1 inline" />
                  Allow microphone access
                </button>
              )}
            </Field>

            <Field label="Camera">
              <Select
                value={options.cameraId ?? 'off'}
                options={[{ id: 'off', label: 'Off' }, ...cameras.map((c) => ({ id: c.id, label: c.label }))]}
                onChange={(id) => setOptions((o) => ({ ...o, cameraId: id === 'off' ? null : id }))}
              />
            </Field>
          </div>

          <div className="space-y-3 rounded-[9px] border border-[var(--color-ink-700)] bg-[var(--color-ink-900)] px-3.5 py-3">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-[12.5px] text-[var(--color-ink-100)]">System audio</span>
                <span className="block text-[11px] text-[var(--color-ink-500)]">
                  {caps?.systemAudio
                    ? 'Captures sound playing on your computer.'
                    : 'Not supported on this platform — record a microphone instead.'}
                </span>
              </span>
              <Toggle
                label="System audio"
                checked={options.systemAudio && (caps?.systemAudio ?? false)}
                onChange={(systemAudio) => setOptions((o) => ({ ...o, systemAudio }))}
              />
            </label>

            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-[12.5px] text-[var(--color-ink-100)]">Show cursor</span>
                <span className="block text-[11px] text-[var(--color-ink-500)]">
                  Keeps the system pointer in the recorded frames.
                </span>
              </span>
              <Toggle
                label="Show cursor"
                checked={options.showCursor}
                onChange={(showCursor) => setOptions((o) => ({ ...o, showCursor }))}
              />
            </label>
          </div>

          <div className="flex items-start gap-2.5 rounded-[9px] bg-[var(--color-ink-900)] px-3.5 py-3">
            <StatusPill tone={caps?.nativeCursorCapture ? 'ok' : 'warn'}>
              {caps?.nativeCursorCapture ? 'Cursor tracking on' : 'Cursor tracking off'}
            </StatusPill>
            <p className="text-[11px] leading-relaxed text-[var(--color-ink-400)]">
              {caps?.nativeCursorCapture
                ? 'Clicks and pointer movement are recorded so the camera can follow them automatically.'
                : 'Automatic camera moves need the desktop app. In the browser you can still place focus points by hand.'}
            </p>
          </div>
        </div>
      </Dialog>

      {activeRecorder && (
        <RecordingOverlay recorder={activeRecorder} onStop={stop} onCancel={cancel} />
      )}
    </>
  );
}

/* ---------------------------------------------------------- overlay */

function RecordingOverlay({
  recorder,
  onStop,
  onCancel,
}: {
  recorder: ScreenRecorder;
  onStop: () => void;
  onCancel: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 24 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setElapsed(recorder.elapsed()), 200);
    return () => clearInterval(id);
  }, [recorder]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragRef.current) return;
      setPosition({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy });
    };
    const up = () => (dragRef.current = null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[300] flex items-center gap-2 rounded-full border border-[var(--color-ink-600)] bg-[var(--color-ink-900)]/95 px-3 py-2 shadow-2xl backdrop-blur"
      style={{
        left: position.x || '50%',
        top: position.y,
        transform: position.x ? 'none' : 'translateX(-50%)',
      }}
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      }}
    >
      <span className="animate-pulse-rec h-2.5 w-2.5 rounded-full bg-[var(--color-danger)]" />
      <span className="text-[12px] font-semibold text-[var(--color-ink-50)]">Recording</span>
      <span className="tabular text-[12px] text-[var(--color-ink-300)]">
        {mins}:{String(secs).padStart(2, '0')}
      </span>

      <span className="mx-1 h-4 w-px bg-[var(--color-ink-700)]" />

      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          if (paused) recorder.resume();
          else recorder.pause();
          setPaused(!paused);
        }}
      >
        {paused ? 'Resume' : 'Pause'}
      </Button>
      <Button size="sm" variant="primary" icon={<IconStop size={13} />} onClick={onStop}>
        Stop
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Discard
      </Button>
    </div>
  );
}
