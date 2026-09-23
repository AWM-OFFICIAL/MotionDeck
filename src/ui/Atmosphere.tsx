/** Shared stage atmosphere for Home / Welcome — light, grain, depth. */

import type { ReactNode } from 'react';

export function Atmosphere({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative flex h-full flex-col overflow-hidden bg-[var(--color-ink-950)] ${className}`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {/* Cyan bloom — product light, not a purple SaaS gradient */}
        <div className="md-bloom absolute -left-[20%] -top-[30%] h-[70%] w-[70%] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.16),transparent_68%)] blur-2xl" />
        <div className="md-bloom-slow absolute -right-[15%] top-[20%] h-[55%] w-[50%] rounded-full bg-[radial-gradient(circle,rgba(14,116,144,0.12),transparent_70%)] blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(34,211,238,0.06),transparent_55%)]" />
        {/* Fine grid for studio depth */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.9) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse at 50% 30%, black 20%, transparent 75%)',
          }}
        />
        {/* Film grain */}
        <div className="md-grain absolute inset-0 opacity-[0.45] mix-blend-overlay" />
        {/* Bottom vignette so projects sit in a pool of focus */}
        <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-[var(--color-ink-950)] to-transparent" />
      </div>
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
