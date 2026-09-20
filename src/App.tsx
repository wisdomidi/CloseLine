import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  seedFirestoreIfEmpty,
  subscribeToMarketStatus,
  subscribeToMarketSuggestion,
  subscribeToStocks,
  subscribeToTrades,
  buildDisplayStocks,
  parseAsOfDate,
  DEFAULT_TICKERS,
} from './firebase';
import { MarketStatusDoc, MarketSuggestionDoc, StockDoc, DisplayStock, TradeDoc } from './types';
import { SessionBanner } from './components/SessionBanner';
import { AfterHoursDeskCard } from './components/AfterHoursDeskCard';
import { Board } from './components/Board';
import { Detail } from './components/Detail';
import { Receipt } from './components/Receipt';
import { WalletButton } from './components/WalletButton';
import { PortfolioModal } from './components/PortfolioModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RefreshCw, History, CheckCircle2 } from 'lucide-react';

// Instant initial cache to guarantee session + top gap render in < 2 seconds
const initialStocks = new Map<string, StockDoc>();
DEFAULT_TICKERS.forEach((s) => {
  initialStocks.set(s.ticker, { ...s, asOf: null });
});

export default function App() {
  const { publicKey } = useWallet();

  // Baseline initial state so first screen renders in < 50ms
  const isWeekendClient = () => {
    const day = new Date().getDay();
    return day === 0 || day === 6;
  };

  const [marketStatus, setMarketStatus] = useState<MarketStatusDoc | null>({
    nyseOpen: false,
    sessionLabel: isWeekendClient() ? 'Weekend' : 'NYSE closed',
    asOf: null,
  });
  const [marketSuggestion, setMarketSuggestion] = useState<MarketSuggestionDoc | null>(null);
  const [stocksMap, setStocksMap] = useState<Map<string, StockDoc>>(initialStocks);
  const [trades, setTrades] = useState<TradeDoc[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [skippedTicker, setSkippedTicker] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'tickers' | 'brands'>('tickers');

  // Loading & Sync states
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // History & Portfolio dashboard state
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [portfolioTab, setPortfolioTab] = useState<'positions' | 'history'>('history');

  // Fullscreen receipt state for direct desk card confirm
  const [deskReceipt, setDeskReceipt] = useState<{
    id: string;
    ticker: string;
    name: string;
    usd: number;
    shares: string;
    status: string;
    price: number | null;
    wallet?: string;
  } | null>(null);

  // Initialize Firestore seed and real-time subscriptions
  useEffect(() => {
    // 1. One-time seed check if empty
    seedFirestoreIfEmpty();

    // 2. Subscribe to market/status and verify with live /api/status
    const unsubscribeMarket = subscribeToMarketStatus((status) => {
      if (status) {
        setMarketStatus(status);
      }
    });

    fetch('/api/status')
      .then((res) => res.json())
      .then((json) => {
        if (json && json.success && json.data) {
          setMarketStatus({
            nyseOpen: json.data.nyseOpen,
            sessionLabel: json.data.sessionLabel,
            asOf: new Date(),
          });
        }
      })
      .catch((err) => console.debug('Status fetch bypassed:', err));

    // 3. Subscribe to market/suggestion
    const unsubscribeSuggestion = subscribeToMarketSuggestion((suggestion) => {
      setMarketSuggestion(suggestion);
    });

    // 4. Subscribe to stocks/*
    const unsubscribeStocks = subscribeToStocks((stocks) => {
      setStocksMap((prevMap) => {
        const nextMap = new Map(prevMap);
        stocks.forEach((stock, ticker) => {
          nextMap.set(ticker, stock);
        });
        return nextMap;
      });
      setIsInitialLoading(false);
    });

    // 5. Fetch fresh live prices from /api/stocks (Finnhub API)
    fetch('/api/stocks')
      .then((res) => res.json())
      .then((json) => {
        if (json && json.success && Array.isArray(json.data)) {
          setStocksMap((prevMap) => {
            const nextMap = new Map(prevMap);
            json.data.forEach((s: any) => {
              const existing = nextMap.get(s.ticker);
              nextMap.set(s.ticker, {
                ticker: s.ticker,
                name: s.name || existing?.name || s.ticker,
                lastClose: s.lastClose ?? existing?.lastClose,
                livePrice: s.livePrice ?? existing?.livePrice,
                asOf: new Date(),
              });
            });
            return nextMap;
          });
          setIsInitialLoading(false);
        }
      })
      .catch((err) => console.debug('Live stocks fetch bypassed:', err));

    // 6. Subscribe to trades collection for live transaction history
    const unsubscribeTrades = subscribeToTrades((loadedTrades) => {
      setTrades(loadedTrades);
    });

    return () => {
      unsubscribeMarket();
      unsubscribeSuggestion();
      unsubscribeStocks();
      unsubscribeTrades();
    };
  }, []);

  // Manual re-fetch / Pull-to-sync market data from backend
  const handleManualSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncNotice(null);

    try {
      // Re-fetch live quotes from Finnhub via /api/stocks
      const res = await fetch('/api/stocks');
      if (res.ok) {
        const json = await res.json();
        if (json && json.success && Array.isArray(json.data)) {
          setStocksMap((prevMap) => {
            const nextMap = new Map(prevMap);
            json.data.forEach((s: any) => {
              const existing = nextMap.get(s.ticker);
              nextMap.set(s.ticker, {
                ticker: s.ticker,
                name: s.name || existing?.name || s.ticker,
                lastClose: s.lastClose ?? existing?.lastClose,
                livePrice: s.livePrice ?? existing?.livePrice,
                asOf: new Date(),
              });
            });
            return nextMap;
          });
          setSyncNotice('Market data updated');
        }
      } else {
        setSyncNotice('Refreshed');
      }
    } catch (err) {
      console.warn('Sync notice:', err);
      setSyncNotice('Refreshed');
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        setSyncNotice(null);
      }, 3000);
    }
  }, [isSyncing]);

  // Compute display stocks sorted by absolute gap %, biggest first
  const displayStocks = useMemo(() => {
    return buildDisplayStocks(stocksMap);
  }, [stocksMap]);

  // Identify stock with the largest absolute gap for After-hours desk
  const topGapStock = useMemo<DisplayStock | null>(() => {
    if (displayStocks.length === 0) return null;
    const top = displayStocks[0];
    return top.gapPercent !== null ? top : null;
  }, [displayStocks]);

  // Keep selectedStock synced with real-time updates
  const selectedStock = useMemo<DisplayStock | null>(() => {
    if (!selectedTicker) return null;
    return displayStocks.find((s) => s.ticker === selectedTicker) || null;
  }, [selectedTicker, displayStocks]);

  // Extract session details strictly from market/status document
  const nyseOpen = marketStatus?.nyseOpen ?? false;
  const sessionLabel = marketStatus?.sessionLabel || (nyseOpen ? 'NYSE open' : 'NYSE closed');
  const sessionAsOf = parseAsOfDate(marketStatus?.asOf);

  // Show After-hours desk card only when market/status.nyseOpen is false and not skipped
  const showDeskCard = !nyseOpen && topGapStock && skippedTicker !== topGapStock.ticker;

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center px-3 py-4 sm:py-8 font-sans antialiased">
        {/* Container constrained for mobile-first clean experience */}
        <main className="w-full max-w-md flex flex-col gap-4 flex-1">
          {/* Header with CloseLine branding, Sync button, Order History, and Wallet */}
          <header className="flex items-center justify-between pt-1 pb-1">
            <div>
              <h1 className="text-xl font-black font-mono tracking-tight text-white flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block"></span>
                CloseLine
              </h1>
              <p className="text-[11px] font-mono text-zinc-500">
                Tokenized stock board &amp; close gaps
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Manual Pull / Sync market data button */}
              <button
                id="header-sync-btn"
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                title="Re-fetch live market data from oracle"
                className={`p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all cursor-pointer ${
                  isSyncing ? 'opacity-80' : 'active:scale-95'
                }`}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isSyncing ? 'animate-spin text-emerald-400' : ''
                  }`}
                />
              </button>

              {/* Transaction History / Orders Dashboard Toggle */}
              <button
                id="header-history-btn"
                type="button"
                onClick={() => {
                  setPortfolioTab('history');
                  setShowPortfolio(true);
                }}
                title="View order and trade history"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer active:scale-95 text-xs font-mono"
              >
                <History className="w-3.5 h-3.5 text-zinc-400" />
                <span>Orders</span>
                {trades.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                    {trades.length}
                  </span>
                )}
              </button>

              <WalletButton />
            </div>
          </header>

          {/* Sync Success Toast Notification */}
          {syncNotice && (
            <div
              id="sync-notification-toast"
              className="px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 text-xs font-mono flex items-center justify-between transition-all"
            >
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{syncNotice}</span>
              </div>
              <span className="text-[10px] text-emerald-500">Live</span>
            </div>
          )}

          {/* Top Session Banner strictly backed by Firestore market/status */}
          <SessionBanner
            nyseOpen={nyseOpen}
            sessionLabel={sessionLabel}
            asOf={sessionAsOf}
          />

          {/* Mode Toggle: Tickers / Brands (I Use This mode) */}
          <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
            <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
              Display Mode
            </span>
            <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
              <button
                id="toggle-tickers"
                type="button"
                onClick={() => setViewMode('tickers')}
                className={`px-3 py-1 text-xs font-mono font-semibold rounded-md transition-all cursor-pointer ${
                  viewMode === 'tickers'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Tickers
              </button>
              <button
                id="toggle-brands"
                type="button"
                onClick={() => setViewMode('brands')}
                className={`px-3 py-1 text-xs font-mono font-semibold rounded-md transition-all cursor-pointer ${
                  viewMode === 'brands'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Brands
              </button>
            </div>
          </div>

          {/* After-hours desk card at the top of the board, only when market/status.nyseOpen is false */}
          {showDeskCard && topGapStock && (
            <AfterHoursDeskCard
              stock={topGapStock}
              suggestion={marketSuggestion}
              sessionLabel={sessionLabel}
              onInspectStock={(stock) => setSelectedTicker(stock.ticker)}
              onSkip={() => setSkippedTicker(topGapStock.ticker)}
              onTradeConfirmed={(tradeInfo) => setDeskReceipt(tradeInfo)}
            />
          )}

          {/* Tokenized Stock Board with Skeleton Indicators */}
          <Board
            stocks={displayStocks}
            sessionLabel={sessionLabel}
            onSelectStock={(stock) => setSelectedTicker(stock.ticker)}
            brandMode={viewMode === 'brands'}
            loading={isInitialLoading || isSyncing}
            isWalletConnected={!!publicKey}
          />

          {/* Detail Panel with Recharts 7-Day Trend, One-tap Buy $20 and Quote -> Fullscreen Receipt flow */}
          <Detail
            stock={selectedStock}
            sessionLabel={sessionLabel}
            onClose={() => setSelectedTicker(null)}
            brandMode={viewMode === 'brands'}
          />

          {/* Direct Desk Card Confirm Receipt if triggered */}
          {deskReceipt && (
            <Receipt
              ticker={deskReceipt.ticker}
              name={deskReceipt.name}
              usd={deskReceipt.usd}
              shares={deskReceipt.shares}
              price={deskReceipt.price}
              status={deskReceipt.status}
              tradeId={deskReceipt.id}
              wallet={deskReceipt.wallet}
              onBackToBoard={() => setDeskReceipt(null)}
            />
          )}

          {/* Transaction History & Portfolio Positions Modal */}
          {showPortfolio && (
            <PortfolioModal
              trades={trades}
              stocks={displayStocks}
              walletAddress={publicKey?.toBase58()}
              initialTab={portfolioTab}
              onClose={() => setShowPortfolio(false)}
            />
          )}

          {/* Mandatory US-person disclaimer visible on board */}
          <footer className="mt-auto pt-6 pb-4 text-center">
            <p
              id="footer-disclaimer"
              className="text-[11px] font-mono text-zinc-500 leading-relaxed max-w-xs mx-auto"
            >
              These tokens are not for US persons. Not equity. Demo only.
            </p>
          </footer>
        </main>
      </div>
    </ErrorBoundary>
  );
}

