import React from 'react';

interface SessionBannerProps {
  nyseOpen: boolean;
  sessionLabel: string;
  asOf: Date | null;
}

export const SessionBanner: React.FC<SessionBannerProps> = ({
  nyseOpen,
  sessionLabel,
  asOf,
}) => {
  const formattedTime = asOf
    ? asOf.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <div
      id="session-banner"
      className="w-full flex items-center justify-between py-2 px-3.5 rounded-lg bg-zinc-900/90 border border-zinc-800/80 text-xs text-zinc-300 backdrop-blur-sm transition-all"
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {nyseOpen ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </>
          ) : (
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
          )}
        </span>
        <span className="font-medium tracking-tight text-zinc-200">
          {sessionLabel || (nyseOpen ? 'NYSE open' : 'NYSE closed')}
        </span>
        {formattedTime && (
          <span className="text-zinc-500 font-mono text-[11px] hidden xs:inline">
            Updated {formattedTime}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {!nyseOpen && !sessionLabel.toLowerCase().includes('weekend') && !sessionLabel.toLowerCase().includes('holiday') && (
          <span
            id="after-hours-badge"
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20"
          >
            After Hours
          </span>
        )}
        <span className="text-[11px] font-mono text-zinc-500">
          24/7 Onchain
        </span>
      </div>
    </div>
  );
};
