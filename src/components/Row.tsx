import React from 'react';
import { Zap } from 'lucide-react';
import { DisplayStock } from '../types';
import { getBrandInfo } from '../brand';

interface RowProps {
  stock: DisplayStock;
  sessionLabel: string;
  onSelect: (stock: DisplayStock) => void;
  index: number;
  brandMode?: boolean;
  isWalletConnected?: boolean;
}

export const Row: React.FC<RowProps> = ({
  stock,
  sessionLabel,
  onSelect,
  index,
  brandMode = false,
  isWalletConnected = false,
}) => {
  const brandInfo = getBrandInfo(stock.ticker, stock.name);
  const isPositive = stock.gap !== null && stock.gap >= 0;

  const formattedGap = stock.gapPercent !== null
    ? `${isPositive ? '+' : ''}${stock.gapPercent.toFixed(2)}%`
    : '—';

  const formattedLivePrice = stock.livePrice !== null
    ? `$${stock.livePrice.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : '—';

  const formattedLastClose = stock.lastClose !== null
    ? `$${stock.lastClose.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : '—';

  return (
    <div
      id={`stock-row-${stock.ticker.toLowerCase()}`}
      onClick={() => onSelect(stock)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(stock);
        }
      }}
      className="group relative w-full flex items-center justify-between p-4 bg-zinc-900/60 hover:bg-zinc-800/80 active:bg-zinc-800 border-b border-zinc-800/60 transition-colors cursor-pointer select-none"
    >
      {/* Left: Brand or Ticker representation */}
      <div className="flex items-center gap-3 min-w-0 pr-3">
        {brandMode ? (
          <>
            {/* Large logo letter tile (Text only, e.g. grey Apple-style tile) */}
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center font-mono font-black text-xl shrink-0 transition-transform group-hover:scale-105 ${brandInfo.tileClass}`}
            >
              {brandInfo.letter}
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold font-mono tracking-tight text-white group-hover:text-amber-300 transition-colors truncate">
                  {brandInfo.brand}
                </span>
                <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-zinc-800 text-zinc-400">
                  {stock.ticker}
                </span>
                {stock.ticker === 'TSLA' && isWalletConnected ? (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/50 flex items-center gap-1 font-semibold">
                    <Zap className="w-2.5 h-2.5 fill-current" />
                    LIVE
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/40 font-medium">
                    PAPER
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400 font-mono">
                <span>Close {formattedLastClose}</span>
                <span className="text-zinc-600">•</span>
                <span className="text-[11px] text-zinc-500">{sessionLabel}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold font-mono tracking-tight text-zinc-100 group-hover:text-white">
                {stock.ticker}
              </span>
              <span className="text-[11px] font-medium text-zinc-500 truncate max-w-[120px] sm:max-w-[180px]">
                {stock.name}
              </span>
              {stock.ticker === 'TSLA' && isWalletConnected ? (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/50 flex items-center gap-1 font-semibold">
                  <Zap className="w-2.5 h-2.5 fill-current" />
                  LIVE SWAP
                </span>
              ) : (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/40 font-medium">
                  PAPER
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400 font-mono">
              <span>Close {formattedLastClose}</span>
              <span className="text-zinc-600">•</span>
              <span className="text-[11px] text-zinc-500">{sessionLabel}</span>
            </div>
          </div>
        )}
      </div>

      {/* Right: Live Price & Gap % */}
      <div className="flex flex-col items-end shrink-0 text-right">
        <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white">
          {formattedLivePrice}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={`font-mono text-xs font-semibold px-1.5 py-0.5 rounded ${
              stock.gapPercent === null
                ? 'text-zinc-500 bg-zinc-800/40 border border-zinc-700/40'
                : isPositive
                ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40'
                : 'text-rose-400 bg-rose-950/60 border border-rose-800/40'
            }`}
          >
            {formattedGap}
          </span>
          <span className="text-[10px] font-mono text-zinc-500" title="Rank by absolute gap">
            #{index + 1}
          </span>
        </div>
      </div>
    </div>
  );
};
