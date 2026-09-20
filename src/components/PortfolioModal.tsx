import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, TrendingUp, TrendingDown, Layers, History, ShieldAlert } from 'lucide-react';
import { TradeDoc, DisplayStock, PortfolioPosition } from '../types';
import { getSolanaExplorerUrl, truncateAddress } from '../solana';
import { getBrandInfo } from '../brand';

interface PortfolioModalProps {
  trades: TradeDoc[];
  stocks: DisplayStock[];
  walletAddress?: string;
  initialTab?: 'positions' | 'history';
  onClose: () => void;
}

export const PortfolioModal: React.FC<PortfolioModalProps> = ({
  trades,
  stocks,
  walletAddress,
  initialTab = 'positions',
  onClose,
}) => {
  const [tab, setTab] = useState<'positions' | 'history'>(initialTab);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'fill' | 'paper' | 'wallet_connected_pending_swap'>('all');

  // Filter trades: if wallet is connected, prioritize wallet trades (or show all if no wallet-specific)
  const filteredTrades = useMemo(() => {
    let list = trades;
    if (walletAddress) {
      const walletTrades = trades.filter((t) => t.wallet === walletAddress);
      if (walletTrades.length > 0) list = walletTrades;
    }

    if (historyFilter === 'fill') {
      return list.filter((t) => t.status === 'fill');
    }
    if (historyFilter === 'paper') {
      return list.filter((t) => t.status === 'paper' || !t.status);
    }
    if (historyFilter === 'wallet_connected_pending_swap') {
      return list.filter((t) => t.status === 'wallet_connected_pending_swap' || t.status === 'solana_confirmed');
    }
    return list;
  }, [trades, walletAddress, historyFilter]);

  // Aggregate positions across FILLED trades only (Stocklana requirement: fills only count in portfolio)
  const positions = useMemo<PortfolioPosition[]>(() => {
    const stockMap = new Map<string, DisplayStock>();
    stocks.forEach((s) => stockMap.set(s.ticker, s));

    const map = new Map<string, { totalShares: number; totalUsd: number; count: number }>();

    // Strictly fills only: intents and paper trades are segregated in the history tabs
    let baseList = trades;
    if (walletAddress) {
      const walletTrades = trades.filter((t) => t.wallet === walletAddress);
      if (walletTrades.length > 0) baseList = walletTrades;
    }
    const filledOnly = baseList.filter((t) => t.status === 'fill');

    filledOnly.forEach((t) => {
      const shares = typeof t.shares === 'number' ? t.shares : (t.price ? t.usd / t.price : 0);
      const prev = map.get(t.ticker) || { totalShares: 0, totalUsd: 0, count: 0 };
      map.set(t.ticker, {
        totalShares: prev.totalShares + shares,
        totalUsd: prev.totalUsd + t.usd,
        count: prev.count + 1,
      });
    });

    const result: PortfolioPosition[] = [];
    map.forEach((data, ticker) => {
      const stock = stockMap.get(ticker);
      const livePrice = stock?.livePrice || 0;
      const currentValue = data.totalShares * livePrice;
      const unrealizedPnl = currentValue - data.totalUsd;

      result.push({
        ticker,
        name: stock?.name || ticker,
        totalShares: data.totalShares,
        totalUsd: data.totalUsd,
        currentValue,
        unrealizedPnl,
        tradeCount: data.count,
      });
    });

    return result.sort((a, b) => b.currentValue - a.currentValue);
  }, [trades, walletAddress, stocks]);

  // Portfolio total statistics based strictly on filled positions
  const portfolioStats = useMemo(() => {
    const totalCost = positions.reduce((acc, p) => acc + p.totalUsd, 0);
    const totalValue = positions.reduce((acc, p) => acc + p.currentValue, 0);
    const totalPnl = totalValue - totalCost;
    const pnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    return { totalCost, totalValue, totalPnl, pnlPercent };
  }, [positions]);

  return (
    <AnimatePresence>
      <div
        id="portfolio-modal-backdrop"
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          id="portfolio-modal"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/90">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-mono font-bold text-white tracking-tight">
                  Portfolio &amp; Orders
                </h2>
                {walletAddress ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    {truncateAddress(walletAddress, 4)}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                    Demo Mode
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-zinc-400 mt-0.5">
                Tokenized stock holdings and trade receipts
              </p>
            </div>

            <button
              id="portfolio-close-btn"
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg bg-zinc-800/60 hover:bg-zinc-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Portfolio Summary Card */}
          <div className="px-5 pt-4 pb-2">
            <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">
                  Verified Position Value (Fills Only)
                </span>
                <span className="text-2xl font-mono font-black text-white">
                  ${portfolioStats.totalValue.toFixed(2)}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">
                  Verified P&amp;L
                </span>
                <div
                  className={`inline-flex items-center gap-1 text-sm font-mono font-bold ${
                    portfolioStats.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {portfolioStats.totalPnl >= 0 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  <span>
                    {portfolioStats.totalPnl >= 0 ? '+' : ''}
                    ${portfolioStats.totalPnl.toFixed(2)} ({portfolioStats.pnlPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-zinc-800 px-5 pt-2">
            <button
              type="button"
              onClick={() => setTab('positions')}
              className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-mono font-semibold transition-colors border-b-2 cursor-pointer ${
                tab === 'positions'
                  ? 'border-cyan-400 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Filled Holdings ({positions.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setTab('history')}
              className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-mono font-semibold transition-colors border-b-2 cursor-pointer ${
                tab === 'history'
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Order History ({filteredTrades.length})</span>
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {tab === 'positions' && (
              <>
                {positions.length === 0 ? (
                  <div className="py-10 px-4 text-center rounded-xl bg-zinc-950/40 border border-zinc-800/80">
                    <div className="w-10 h-10 rounded-full bg-cyan-950/60 border border-cyan-800/50 flex items-center justify-center mx-auto mb-3 text-cyan-400">
                      <Layers className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-mono font-bold text-white">
                      No Filled Holdings Yet
                    </p>
                    <p className="text-xs font-mono text-zinc-400 max-w-sm mx-auto mt-1.5 leading-relaxed">
                      Holdings strictly count completed onchain swap fills (<strong className="text-cyan-300">TSLAx via Jupiter</strong>).
                    </p>
                    <p className="text-[11px] font-mono text-zinc-500 mt-2">
                      Signed order intents (memos) and paper trades stay in the Order History tab.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTab('history')}
                      className="mt-4 px-3 py-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 text-xs font-mono text-zinc-300 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>View Order History ({filteredTrades.length})</span>
                    </button>
                  </div>
                ) : (
                  positions.map((pos) => {
                    const brand = getBrandInfo(pos.ticker, pos.name);
                    const isPositive = pos.unrealizedPnl >= 0;
                    return (
                      <div
                        key={pos.ticker}
                        className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-sm shrink-0 ${brand.tileClass}`}
                          >
                            {brand.letter}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-sm text-white">
                                {pos.ticker}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-400">
                                {brand.brand}
                              </span>
                            </div>
                            <span className="text-xs font-mono text-zinc-400">
                              {pos.totalShares.toFixed(4)} shares
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-mono font-bold text-sm text-white">
                            ${pos.currentValue.toFixed(2)}
                          </div>
                          <div
                            className={`text-xs font-mono font-medium ${
                              isPositive ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isPositive ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {tab === 'history' && (
              <div className="space-y-3">
                {/* Filter Sub-toggle */}
                <div className="flex items-center gap-1.5 p-1 bg-zinc-950/80 border border-zinc-800 rounded-lg text-[11px] font-mono">
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('all')}
                    className={`flex-1 py-1 px-2 rounded-md font-semibold transition-colors cursor-pointer text-center ${
                      historyFilter === 'all'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('fill')}
                    className={`flex-1 py-1 px-2 rounded-md font-semibold transition-colors cursor-pointer text-center ${
                      historyFilter === 'fill'
                        ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Filled (Track B)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('paper')}
                    className={`flex-1 py-1 px-2 rounded-md font-semibold transition-colors cursor-pointer text-center ${
                      historyFilter === 'paper'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Paper
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('wallet_connected_pending_swap')}
                    className={`flex-1 py-1 px-2 rounded-md font-semibold transition-colors cursor-pointer text-center ${
                      historyFilter === 'wallet_connected_pending_swap'
                        ? 'bg-zinc-800 text-emerald-400'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Signed Intent
                  </button>
                </div>

                {filteredTrades.length === 0 ? (
                  <div className="py-10 text-center bg-zinc-950/40 rounded-xl border border-zinc-800/60 p-4">
                    <p className="text-xs font-mono text-zinc-400">
                      No trades found in this category.
                    </p>
                    <p className="text-[11px] font-mono text-zinc-600 mt-1">
                      Execute a $20 order on the board to see it appear here in real time.
                    </p>
                  </div>
                ) : (
                  filteredTrades.map((t) => {
                    const tradeDate = t.ts instanceof Date
                      ? t.ts
                      : (t.ts as any)?.seconds
                      ? new Date((t.ts as any).seconds * 1000)
                      : new Date();

                    const timeLabel = tradeDate.toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    const isFill = t.status === 'fill';
                    const isConfirmed = t.status === 'solana_confirmed';
                    const isPending = t.status === 'wallet_connected_pending_swap';

                    return (
                      <div
                        key={t.id || `${t.ticker}-${tradeDate.getTime()}`}
                        className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-white">
                              BUY {t.ticker}
                            </span>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                                isFill
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                  : isConfirmed
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : isPending
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {isFill
                                ? 'Filled (Jupiter)'
                                : isConfirmed
                                ? 'Signed Intent'
                                : isPending
                                ? 'Pending Intent'
                                : 'Paper Trade'}
                            </span>
                          </div>

                          <div className="text-[11px] font-mono text-zinc-500 mt-1">
                            <span>{timeLabel}</span>
                            {t.shares && (
                              <span className="ml-1 text-zinc-400">• {t.shares.toFixed(4)} shares</span>
                            )}
                          </div>
                        </div>

                        <div className="text-right flex flex-col items-end">
                          <span className="font-mono font-bold text-sm text-white">
                            ${t.usd.toFixed(2)}
                          </span>

                          {t.txHash ? (
                            <a
                              href={getSolanaExplorerUrl(t.txHash)}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-0.5 text-[10px] font-mono text-emerald-400 hover:text-emerald-300 mt-0.5"
                            >
                              <span>Explorer</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-[10px] font-mono text-zinc-500">
                              #{t.id?.slice(0, 6) || 'demo'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Footer Disclaimer */}
          <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 text-center">
            <p className="text-[11px] font-mono text-zinc-500 leading-relaxed">
              These tokens are not for US persons. Not equity. Demo only.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
