import React from 'react';
import { DisplayStock } from '../types';
import { Row } from './Row';

interface BoardProps {
  stocks: DisplayStock[];
  sessionLabel: string;
  onSelectStock: (stock: DisplayStock) => void;
  brandMode?: boolean;
  loading?: boolean;
  isWalletConnected?: boolean;
}

export const Board: React.FC<BoardProps> = ({
  stocks,
  sessionLabel,
  onSelectStock,
  brandMode = false,
  loading = false,
  isWalletConnected = false,
}) => {
  const showSkeletons = loading || stocks.length === 0;

  return (
    <div
      id="stock-board"
      className="w-full rounded-xl overflow-hidden bg-zinc-900/40 border border-zinc-800/80 shadow-2xl shadow-black/60 divide-y divide-zinc-800/60 transition-all"
    >
      {/* "I Use This" line when brand mode is active */}
      {brandMode && (
        <div
          id="brand-mode-banner"
          className="px-4 py-2.5 bg-gradient-to-r from-zinc-900 via-zinc-800/90 to-zinc-900 border-b border-zinc-800 text-center"
        >
          <p className="text-xs font-mono font-semibold text-zinc-200 tracking-wide">
            You use this. Own a slice.
          </p>
        </div>
      )}

      {/* Board column header with subtle loading indicator */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/80 text-[11px] font-mono uppercase tracking-wider text-zinc-500 border-b border-zinc-800/80">
        <div className="flex items-center gap-1.5">
          <span>{brandMode ? 'Brand / Asset' : 'Ticker / Last Close'}</span>
          {loading && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
          )}
        </div>
        <span className="text-right">Live Price / Gap</span>
      </div>

      {/* Skeleton Rows when waiting for Firestore data */}
      {showSkeletons ? (
        <div id="board-skeletons" className="divide-y divide-zinc-800/40">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3.5 bg-zinc-900/20 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-800/60 flex-shrink-0" />
                <div className="space-y-1.5">
                  <div className="w-16 h-3.5 bg-zinc-800/80 rounded" />
                  <div className="w-28 h-2.5 bg-zinc-800/40 rounded" />
                </div>
              </div>
              <div className="flex flex-col items-end space-y-1.5">
                <div className="w-16 h-4 bg-zinc-800/70 rounded" />
                <div className="w-14 h-4 bg-zinc-800/40 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Stock Rows */
        stocks.map((stock, index) => (
          <Row
            key={stock.ticker}
            stock={stock}
            sessionLabel={sessionLabel}
            onSelect={onSelectStock}
            index={index}
            brandMode={brandMode}
            isWalletConnected={isWalletConnected}
          />
        ))
      )}
    </div>
  );
};
