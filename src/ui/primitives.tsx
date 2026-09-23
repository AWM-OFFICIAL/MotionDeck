/** Shared controls. Every interactive element here is keyboard reachable and labelled. */

import clsx from 'clsx';
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { IconCheck, IconChevronDown, IconClose } from './icons';

/* ------------------------------------------------------------------ button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accentGhost';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-accent)] text-[#04262c] hover:bg-[#3ee0f7] active:bg-[#18b9d3] font-semibold shadow-[0_1px_0_rgba(255,255,255,0.14)_inset]',
  secondary:
    'bg-[var(--color-ink-750)] text-[var(--color-ink-100)] hover:bg-[var(--color-ink-700)] active:bg-[var(--color-ink-600)] border border-[var(--color-ink-600)]',
  ghost:
    'bg-transparent text-[var(--color-ink-200)] hover:bg-[var(--color-ink-750)] hover:text-[var(--color-ink-50)] active:bg-[var(--color-ink-700)]',
  accentGhost:
    'bg-[rgba(34,211,238,0.1)] text-[var(--color-accent)] hover:bg-[rgba(34,211,238,0.16)] border border-[rgba(34,211,238,0.28)]',
  danger: 'bg-[#3a1b1d] text-[var(--color-danger)] hover:bg-[#4a2124] border border-[#5c2a2e]',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-[6px]',
  md: 'h-8.5 px-3.5 text-[13px] gap-2 rounded-[8px]',
  lg: 'h-11 px-5 text-[14px] gap-2.5 rounded-[10px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  fullWidth,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex items-center justify-center whitespace-nowrap transition-colors duration-100',
        'disabled:opacity-40 disabled:pointer-events-none select-none',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------- icon button */

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only controls must still be announced and hoverable. */
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger';
}

export function IconButton({
  label,
  active,
  size = 'md',
  tone = 'default',
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        className={clsx(
          'inline-flex items-center justify-center rounded-[7px] transition-colors duration-100',
          'disabled:opacity-35 disabled:pointer-events-none',
          size === 'sm' ? 'h-7 w-7' : 'h-8.5 w-8.5',
          active
            ? 'bg-[rgba(34,211,238,0.14)] text-[var(--color-accent)]'
            : tone === 'danger'
              ? 'text-[var(--color-ink-300)] hover:bg-[#3a1b1d] hover:text-[var(--color-danger)]'
              : 'text-[var(--color-ink-300)] hover:bg-[var(--color-ink-750)] hover:text-[var(--color-ink-50)]',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/* ----------------------------------------------------------------- tooltip */

export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    timer.current = setTimeout(() => {
      const rect = ref.current?.firstElementChild?.getBoundingClientRect();
      if (!rect) return;
      setCoords({ x: rect.left + rect.width / 2, y: rect.bottom + 8 });
      setOpen(true);
    }, 420);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <>
      <span
        ref={ref}
        className="contents"
        onPointerEnter={show}
        onPointerLeave={hide}
        onPointerDown={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          className="animate-in pointer-events-none fixed z-[200] -translate-x-1/2 rounded-[6px] border border-[var(--color-ink-600)] bg-[var(--color-ink-800)] px-2 py-1 text-[11.5px] text-[var(--color-ink-100)] shadow-lg"
          style={{ left: coords.x, top: coords.y }}
        >
          {content}
        </span>
      )}
    </>
  );
}

/* ------------------------------------------------------------------- field */

export function Field({
  label,
  hint,
  children,
  inline,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <label className={clsx('block', inline ? 'flex items-center justify-between gap-3' : 'space-y-1.5')}>
      <span
        className={clsx(
          'text-[11px] font-medium tracking-wide text-[var(--color-ink-300)]',
          inline && 'shrink-0',
        )}
      >
        {label}
      </span>
      <span className={clsx(inline ? 'min-w-0 flex-1' : 'block')}>{children}</span>
      {hint && !inline && <span className="block text-[10.5px] text-[var(--color-ink-400)]">{hint}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------- input */

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'h-8 w-full rounded-[7px] border border-[var(--color-ink-600)] bg-[var(--color-ink-900)] px-2.5',
        'text-[13px] text-[var(--color-ink-50)] placeholder:text-[var(--color-ink-400)]',
        'transition-colors focus:border-[var(--color-accent)] focus:outline-none',
        className,
      )}
      {...rest}
    />
  );
}

/** Numeric input with drag-to-scrub, the interaction pros expect from a creative tool. */
export function NumberInput({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  suffix,
  precision = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  precision?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const drag = useRef<{ startX: number; startValue: number } | null>(null);

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    setDraft(null);
    if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, parsed)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { startX: e.clientX, startValue: value };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.startX;
      if (Math.abs(dx) < 3) return;
      // Shift = fine control, a near-universal convention.
      const scale = e.shiftKey ? step / 4 : step;
      onChange(Math.min(max, Math.max(min, drag.current.startValue + dx * scale)));
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [max, min, onChange, step]);

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        value={draft ?? value.toFixed(precision)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraft(null);
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            onChange(Math.min(max, value + step * (e.shiftKey ? 10 : 1)));
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(Math.max(min, value - step * (e.shiftKey ? 10 : 1)));
          }
        }}
        onPointerDown={onPointerDown}
        className="tabular h-8 w-full cursor-ew-resize rounded-[7px] border border-[var(--color-ink-600)] bg-[var(--color-ink-900)] px-2.5 text-[12.5px] text-[var(--color-ink-50)] transition-colors focus:cursor-text focus:border-[var(--color-accent)] focus:outline-none"
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[var(--color-ink-400)]">
          {suffix}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ slider */

export function Slider({
  value,
  onChange,
  onCommit,
  min = 0,
  max = 1,
  step = 0.01,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
      <span className="tabular w-11 shrink-0 text-right text-[11.5px] text-[var(--color-ink-300)]">
        {format ? format(value) : value.toFixed(2)}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ select */

export interface SelectOption<T extends string> {
  id: T;
  label: string;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 w-full cursor-pointer appearance-none rounded-[7px] border border-[var(--color-ink-600)] bg-[var(--color-ink-900)] pl-2.5 pr-7 text-[12.5px] text-[var(--color-ink-50)] transition-colors hover:border-[var(--color-ink-500)] focus:border-[var(--color-accent)] focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} className="bg-[var(--color-ink-800)]">
            {o.label}
          </option>
        ))}
      </select>
      <IconChevronDown
        size={13}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-ink-400)]"
      />
    </div>
  );
}

/* --------------------------------------------------------------- segmented */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      className="inline-flex w-full gap-0.5 rounded-[8px] border border-[var(--color-ink-700)] bg-[var(--color-ink-900)] p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          type="button"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={clsx(
            'flex-1 rounded-[6px] px-2 font-medium transition-colors duration-100',
            size === 'sm' ? 'h-6 text-[11.5px]' : 'h-7 text-[12.5px]',
            value === o.id
              ? 'bg-[var(--color-ink-700)] text-[var(--color-ink-50)]'
              : 'text-[var(--color-ink-300)] hover:text-[var(--color-ink-100)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ toggle */

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150',
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-ink-600)]',
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-150',
          checked ? 'translate-x-4.5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------- chips */

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx(
        'rounded-[7px] border px-2.5 py-1.5 text-[12px] font-medium transition-all duration-100',
        active
          ? 'border-[rgba(34,211,238,0.5)] bg-[rgba(34,211,238,0.12)] text-[var(--color-accent)]'
          : 'border-[var(--color-ink-700)] bg-[var(--color-ink-850)] text-[var(--color-ink-200)] hover:border-[var(--color-ink-500)] hover:text-[var(--color-ink-50)]',
      )}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- collapse */

export function Collapsible({
  title,
  children,
  defaultOpen = false,
  accessory,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  accessory?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className="hairline-b">
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-1.5 px-3.5 py-2.5 text-left text-[12px] font-semibold tracking-wide text-[var(--color-ink-100)] transition-colors hover:text-white"
        >
          <IconChevronDown
            size={13}
            className={clsx(
              'text-[var(--color-ink-400)] transition-transform duration-150',
              !open && '-rotate-90',
            )}
          />
          {title}
        </button>
        {accessory && <div className="pr-2.5">{accessory}</div>}
      </div>
      {open && (
        <div id={id} className="animate-in space-y-3 px-3.5 pb-4 pt-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ dialog */

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && ref.current) {
        // Trap focus so keyboard users can't tab into the editor behind the dialog.
        const focusable = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    const timer = setTimeout(() => {
      ref.current?.querySelector<HTMLElement>('button, input, select')?.focus();
    }, 30);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
      <div
        className="animate-in absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width, maxWidth: '100%' }}
        className="animate-rise relative flex max-h-[86vh] flex-col overflow-hidden rounded-[14px] border border-[var(--color-ink-600)] bg-[var(--color-ink-850)] shadow-2xl"
      >
        <header className="hairline-b flex items-start gap-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-[var(--color-ink-50)]">{title}</h2>
            {description && (
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--color-ink-300)]">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <IconClose size={15} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="hairline-t flex items-center justify-end gap-2 px-5 py-3.5">{footer}</footer>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- empty state */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-[var(--color-ink-500)]">{icon}</div>}
      <p className="text-[13px] font-medium text-[var(--color-ink-200)]">{title}</p>
      {body && <p className="mt-1 max-w-[280px] text-[12px] leading-relaxed text-[var(--color-ink-400)]">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- sections */

export function PanelSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="px-3.5 py-3">
      <header className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-400)]">
          {title}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}

export function ColorSwatch({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={label}
        value={value.startsWith('#') ? value.slice(0, 7) : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 shrink-0"
      />
      <TextInput value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} hex`} className="h-7 text-[12px]" />
    </div>
  );
}

export function StatusPill({ tone, children }: { tone: 'ok' | 'warn' | 'error' | 'muted'; children: ReactNode }) {
  const tones = {
    ok: 'text-[var(--color-ok)] bg-[rgba(52,211,153,0.1)]',
    warn: 'text-[var(--color-warn)] bg-[rgba(251,191,36,0.1)]',
    error: 'text-[var(--color-danger)] bg-[rgba(248,113,113,0.1)]',
    muted: 'text-[var(--color-ink-300)] bg-[var(--color-ink-800)]',
  } as const;
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]', tones[tone])}>
      {children}
    </span>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      className="spin inline-block rounded-full border-2 border-[var(--color-ink-600)] border-t-[var(--color-accent)]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export { IconCheck };
