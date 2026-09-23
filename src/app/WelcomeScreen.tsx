/** First-launch screen — brand stage, not a form. */

import { Button, Spinner } from '../ui/primitives';
import { IconImport, IconRecord, IconTemplates } from '../ui/icons';
import { Atmosphere } from '../ui/Atmosphere';

interface Props {
  onRecord: () => void;
  onTemplates: () => void;
  onImport: () => void;
  onOpenSample: () => void;
  sampleLoading: boolean;
}

export function WelcomeScreen({ onRecord, onTemplates, onImport, onOpenSample, sampleLoading }: Props) {
  return (
    <Atmosphere>
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="animate-rise w-full max-w-[520px] text-center">
          <img
            src="/logo.png"
            alt="MotionDeck"
            className="mx-auto h-[96px] w-auto max-w-[300px] object-contain drop-shadow-[0_0_40px_rgba(34,211,238,0.28)]"
          />

          <h1 className="mt-8 font-display text-[clamp(1.65rem,3.5vw,2.15rem)] font-semibold leading-[1.15] tracking-[-0.035em] text-[var(--color-ink-50)]">
            Create motion graphics
            <span className="block text-[var(--color-ink-300)]">without the learning curve.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-[26rem] text-[14px] leading-relaxed text-[var(--color-ink-400)]">
            Record your app, pick a look, export a polished demo — all on this computer.
          </p>

          <div className="mt-9 space-y-2.5">
            <button
              type="button"
              onClick={onRecord}
              className="md-cta inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-[12px] bg-[var(--color-accent)] text-[14px] font-semibold tracking-tight text-[#04222b] transition-transform duration-150 hover:scale-[1.015] active:scale-[0.99]"
            >
              <IconRecord size={17} />
              Record My Screen
            </button>
            <Button size="lg" fullWidth icon={<IconTemplates size={16} />} onClick={onTemplates}>
              Start With a Template
            </Button>
            <Button size="lg" fullWidth icon={<IconImport size={16} />} onClick={onImport}>
              Import a Recording
            </Button>
          </div>

          <button
            type="button"
            onClick={onOpenSample}
            disabled={sampleLoading}
            className="mt-7 inline-flex items-center gap-2 text-[13px] text-[var(--color-accent)] transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {sampleLoading && <Spinner size={12} />}
            {sampleLoading ? 'Building the example…' : 'Or explore the example project'}
          </button>

          <p className="mt-10 text-[11.5px] leading-relaxed text-[var(--color-ink-500)]">
            Recordings stay on this computer. MotionDeck never uploads your screen.
          </p>
        </div>
      </div>
    </Atmosphere>
  );
}
