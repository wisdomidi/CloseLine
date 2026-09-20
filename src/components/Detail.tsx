import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowLeft, Loader2, AlertCircle, ShieldCheck, Zap, RefreshCw, Sparkles } from 'lucide-react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { DisplayStock } from '../types';
import { recordTrade } from '../firebase';
import {
  truncateAddress,
  createCloseLineOrderTransaction,
  fetchJupiterQuote,
  fetchJupiterSwapTransaction,
  SOLANA_MINTS,
  SOLANA_NETWORK,
  JupiterQuoteResponse,
} from '../solana';
import { getBrandInfo } from '../brand';
import { Receipt } from './Receipt';
import { StockPriceChart } from './StockPriceChart';
import { getDeskRationale } from '../utils/deskTheses';

interface DetailProps {
  stock: DisplayStock | null;
  sessionLabel: string;
  onClose: () => void;
  brandMode?: boolean;
}

const PRESET_AMOUNTS = [5, 10, 20];

export const Detail: React.FC<DetailProps> = ({
  stock,
  sessionLabel,
  onClose,
  brandMode = false,
}) => {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const [step, setStep] = useState<'detail' | 'quote' | 'receipt'>('detail');
  const [ticketSize, setTicketSize] = useState<number>(5);
  const [isCustomSize, setIsCustomSize] = useState<boolean>(false);
  const [customInput, setCustomInput] = useState<string>('5');
  const [slippage, setSlippage] = useState<number>(0.5); // 0.5% default
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Jupiter live quote state for real swaps
  const [jupQuote, setJupQuote] = useState<JupiterQuoteResponse | null>(null);
  const [quoting, setQuoting] = useState<boolean>(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [tradeReceipt, setTradeReceipt] = useState<{
    id: string;
    usd: number;
    shares: string;
    status: string;
    price: number | null;
    wallet?: string;
    txHash?: string;
    inUsdc?: number;
    outTokens?: string;
    route?: string;
    priceImpactPct?: string;
  } | null>(null);

  const isTslaSwapSupported = stock?.ticker === 'TSLA';

  // Dynamic After-Hours Desk Insight (Curated Institutional Thesis + Gemini AI on-demand)
  const [deskInsight, setDeskInsight] = useState(() =>
    stock ? getDeskRationale(stock.ticker, stock.gapPercent, ticketSize) : null
  );
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiEngine, setAiEngine] = useState<'gemini_ai' | 'curated_desk'>('curated_desk');
  const [activeModel, setActiveModel] = useState<string>('Gemini Flash');

  const requestAiAnalysis = async () => {
    if (!stock) return;
    setLoadingAi(true);
    try {
      const res = await fetch(
        `/api/desk/analyze?ticker=${encodeURIComponent(stock.ticker)}&gap=${encodeURIComponent(
          stock.gapPercent ?? 0
        )}&price=${encodeURIComponent(stock.livePrice ?? 0)}&close=${encodeURIComponent(
          stock.lastClose ?? 0
        )}&size=${encodeURIComponent(ticketSize)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.thesis) {
          setDeskInsight({
            thesis: data.thesis,
            catalyst: data.catalyst || deskInsight?.catalyst || '',
            strategy: data.strategy || deskInsight?.strategy || '',
          });
          setAiEngine(data.source || 'gemini_ai');
          if (data.model) {
            setActiveModel(data.model.replace(/^models\//, ''));
          }
        }
      }
    } catch (e) {
      console.warn('AI analysis request note:', e);
    } finally {
      setLoadingAi(false);
    }
  };

  useEffect(() => {
    if (stock) {
      setDeskInsight(getDeskRationale(stock.ticker, stock.gapPercent, ticketSize));
      setAiEngine('curated_desk');
      // Request fresh Gemini analysis asynchronously in background
      requestAiAnalysis();
    }
  }, [stock?.ticker, ticketSize]);

  // Fetch real Jupiter quote when on quote step for TSLA
  useEffect(() => {
    let active = true;
    if (stock && step === 'quote' && isTslaSwapSupported && ticketSize > 0) {
      setQuoting(true);
      setQuoteError(null);
      // USDC has 6 decimals: $20 = 20,000,000 atomic units
      const usdcAtomic = Math.round(ticketSize * 1_000_000);
      const slippageBps = Math.round(slippage * 100);

      fetchJupiterQuote(SOLANA_MINTS.USDC, SOLANA_MINTS.TSLA, usdcAtomic, slippageBps)
        .then((quote) => {
          if (!active) return;
          if (quote) {
            setJupQuote(quote);
            setQuoteError(null);
          } else {
            setJupQuote(null);
            setQuoteError('No direct Jupiter swap route found for TSLAx/USDC.');
          }
        })
        .catch((err: any) => {
          if (!active) return;
          console.warn('Jupiter quote fetch note:', err);
          setJupQuote(null);
          setQuoteError(err?.message || 'Jupiter route query failed.');
        })
        .finally(() => {
          if (active) setQuoting(false);
        });
    } else {
      setJupQuote(null);
      setQuoting(false);
      setQuoteError(null);
    }
    return () => {
      active = false;
    };
  }, [stock, step, isTslaSwapSupported, ticketSize, slippage]);

  if (!stock) return null;

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

  const estimatedShares = stock.livePrice && stock.livePrice > 0 && ticketSize > 0
    ? (ticketSize / stock.livePrice).toFixed(4)
    : '0.0000';

  // Derived output tokens from Jupiter quote if available (TSLAx has 8 or 6 decimals, or formatted from quote)
  const jupiterEstimatedTokens = jupQuote
    ? (Number(jupQuote.outAmount) / 1e8 > 0.0001
        ? (Number(jupQuote.outAmount) / 1e8).toFixed(4)
        : (Number(jupQuote.outAmount) / 1e6).toFixed(4))
    : null;

  // When live Jupiter quote is active (connected wallet with TSLAx), use Jupiter's precise output.
  // In paper demo mode, calculate strictly from the board price: ticketSize / stock.livePrice.
  const displayTokens = (connected && isTslaSwapSupported && jupiterEstimatedTokens) 
    ? jupiterEstimatedTokens 
    : estimatedShares;

  // Confirm trade submission with real or simulated Solana transaction
  const handleConfirmTrade = async () => {
    if (!stock.livePrice || stock.livePrice <= 0) {
      setErrorMsg('Live price unavailable for this asset');
      return;
    }

    if (ticketSize <= 0) {
      setErrorMsg('Please select or enter a valid purchase amount');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const isSolana = connected && publicKey;
      const walletAddress = isSolana ? publicKey.toBase58() : undefined;
      let txHash: string | undefined = undefined;
      let status: 'fill' | 'solana_confirmed' | 'wallet_connected_pending_swap' | 'paper' = isSolana ? 'wallet_connected_pending_swap' : 'paper';
      let inUsdcAmount = ticketSize;
      let outTokensAmount = displayTokens;
      let routeLabel: string | undefined = undefined;
      let priceImpact: string | undefined = undefined;

      // TRACK B: Real Jupiter swap on TSLA when wallet is connected
      if (isSolana && isTslaSwapSupported) {
        if (!jupQuote) {
          setErrorMsg('A valid Jupiter route quote is required to execute a live swap. Please retry or adjust ticket size.');
          setSubmitting(false);
          return;
        }

        if (!sendTransaction || !connection) {
          setErrorMsg('Solana wallet connection not ready.');
          setSubmitting(false);
          return;
        }

        try {
          routeLabel = jupQuote.routePlan.map((r) => r.swapInfo.label).join(' → ') || 'Jupiter Direct';
          priceImpact = jupQuote.priceImpactPct ? `${(parseFloat(jupQuote.priceImpactPct) * 100).toFixed(2)}%` : '0.00%';

          const swapTx = await fetchJupiterSwapTransaction(jupQuote, publicKey);
          if (!swapTx) {
            throw new Error('Jupiter failed to generate swap transaction. Check wallet balance or Token-2022 account.');
          }

          const signature = await sendTransaction(swapTx, connection);
          txHash = signature;
          status = 'fill';
        } catch (swapErr: any) {
          console.error('[Track B] Jupiter TSLA swap error:', swapErr);
          // CRITICAL: Turn OFF memo fallback for TSLA. If swap fails, surface the real error directly!
          const rawMsg = swapErr?.message || 'Transaction declined or failed onchain';
          setErrorMsg(`TSLAx Swap Error: ${rawMsg}. (Memo fallback disabled for live swaps)`);
          setSubmitting(false);
          return;
        }
      } else if (isSolana && sendTransaction && connection) {
        // Standard Signed Intent via SPL Memo for non-TSLA or unrouted assets
        try {
          const transaction = createCloseLineOrderTransaction(
            publicKey,
            stock.ticker,
            ticketSize,
            estimatedShares,
            Math.round(slippage * 100)
          );
          
          const latestBlockhash = await connection.getLatestBlockhash();
          transaction.recentBlockhash = latestBlockhash.blockhash;
          transaction.feePayer = publicKey;

          const signature = await sendTransaction(transaction, connection);
          txHash = signature;
          status = 'solana_confirmed';
        } catch (walletErr: any) {
          console.warn('Solana onchain broadcast skipped/declined:', walletErr);
          status = 'wallet_connected_pending_swap';
          txHash = 'demo_' + Math.random().toString(36).substring(2, 12);
        }
      }

      const tradeId = await recordTrade({
        ticker: stock.ticker,
        usd: ticketSize,
        ts: new Date(),
        status,
        wallet: walletAddress || null,
        shares: parseFloat(outTokensAmount) || null,
        price: stock.livePrice ?? null,
        txHash: txHash || null,
        network: isSolana ? SOLANA_NETWORK : 'paper',
        inUsdc: inUsdcAmount,
        outTokens: outTokensAmount,
        route: routeLabel || (isSolana ? 'Jupiter / Solana SPL' : 'Paper Trade (Simulated)'),
        priceImpactPct: priceImpact || null,
      });

      setTradeReceipt({
        id: tradeId,
        usd: ticketSize,
        shares: outTokensAmount,
        status,
        price: stock.livePrice,
        wallet: walletAddress,
        txHash,
        inUsdc: inUsdcAmount,
        outTokens: outTokensAmount,
        route: routeLabel,
        priceImpactPct: priceImpact,
      });

      // Advance directly to full screen Receipt
      setStep('receipt');
    } catch (err: any) {
      console.error('Error confirming trade:', err);
      setErrorMsg(err?.message || 'Failed to submit trade.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackToBoard = () => {
    setStep('detail');
    setTradeReceipt(null);
    setErrorMsg(null);
    onClose();
  };

  const handleSelectAmount = (amt: number) => {
    setTicketSize(amt);
    setIsCustomSize(false);
  };

  const handleCustomChange = (val: string) => {
    setCustomInput(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setTicketSize(num);
    }
  };

  // Fullscreen Receipt view
  if (step === 'receipt' && tradeReceipt) {
    return (
      <Receipt
        ticker={stock.ticker}
        name={brandMode ? brandInfo.brand : stock.name}
        usd={tradeReceipt.usd}
        shares={tradeReceipt.shares}
        price={tradeReceipt.price}
        status={tradeReceipt.status}
        tradeId={tradeReceipt.id}
        wallet={tradeReceipt.wallet}
        txHash={tradeReceipt.txHash}
        network={SOLANA_NETWORK}
        inUsdc={tradeReceipt.inUsdc}
        outTokens={tradeReceipt.outTokens}
        route={tradeReceipt.route}
        priceImpactPct={tradeReceipt.priceImpactPct}
        onBackToBoard={handleBackToBoard}
      />
    );
  }

  return (
    <AnimatePresence>
      <div
        id="detail-panel-backdrop"
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
        onClick={handleBackToBoard}
      >
        <motion.div
          id="detail-panel"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto"
        >
          {/* STEP 1: ASSET DETAIL VIEW */}
          {step === 'detail' && (
            <div className="space-y-4">
              {/* Header & Close */}
              <div className="flex items-start justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  {/* Large Logo Letter Tile */}
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center font-mono font-black text-xl shrink-0 ${brandInfo.tileClass}`}
                  >
                    {brandInfo.letter}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold font-mono tracking-tight text-white">
                        {brandMode ? brandInfo.brand : stock.ticker}
                      </h2>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300">
                        {brandMode ? stock.ticker : 'TOKENIZED'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {brandMode ? stock.name : brandInfo.brand}
                    </p>
                  </div>
                </div>

                <button
                  id="detail-close-btn"
                  onClick={handleBackToBoard}
                  className="p-1.5 -mr-1 text-zinc-400 hover:text-white rounded-lg bg-zinc-800/60 hover:bg-zinc-800 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Pricing Cards with subtle skeleton state if price is resolving */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">
                    Live Onchain
                  </span>
                  {stock.livePrice !== null ? (
                    <span className="text-2xl font-bold font-mono text-white">
                      {formattedLivePrice}
                    </span>
                  ) : (
                    <div className="w-24 h-7 bg-zinc-800/80 rounded animate-pulse my-0.5" />
                  )}
                </div>

                <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">
                    Last Close
                  </span>
                  {stock.lastClose !== null ? (
                    <span className="text-2xl font-bold font-mono text-zinc-300">
                      {formattedLastClose}
                    </span>
                  ) : (
                    <div className="w-24 h-7 bg-zinc-800/80 rounded animate-pulse my-0.5" />
                  )}
                </div>
              </div>

              {/* 7-Day Trend Chart using Recharts */}
              <StockPriceChart
                ticker={stock.ticker}
                livePrice={stock.livePrice}
                lastClose={stock.lastClose}
                isPositive={isPositive}
              />

              {/* Gap & Session Information */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/50 border border-zinc-800/80 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">Close Gap:</span>
                  <span
                    className={`font-bold px-1.5 py-0.5 rounded ${
                      isPositive
                        ? 'text-emerald-400 bg-emerald-950/60'
                        : 'text-rose-400 bg-rose-950/60'
                    }`}
                  >
                    {formattedGap}
                  </span>
                </div>
                <span className="text-zinc-400">{sessionLabel}</span>
              </div>

              {/* After-Hours Desk Rationale Callout */}
              {stock.gap !== null && deskInsight && (
                <div
                  id="detail-after-hours-rationale"
                  className="p-3.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/25 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Desk Rationale & Thesis</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                          aiEngine === 'gemini_ai'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                        }`}
                      >
                        {aiEngine === 'gemini_ai' ? activeModel : 'Desk Research'}
                      </span>

                      <button
                        type="button"
                        onClick={requestAiAnalysis}
                        disabled={loadingAi}
                        title="Refresh Gemini AI analysis"
                        className="p-1 rounded text-zinc-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-2.5 h-2.5 ${loadingAi ? 'animate-spin text-amber-400' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {deskInsight.catalyst && (
                    <div className="text-[10px] font-mono text-amber-300/90 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded w-fit">
                      <Zap className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
                      <span>{deskInsight.catalyst}</span>
                    </div>
                  )}

                  <p className="text-xs font-mono text-zinc-200 leading-relaxed">
                    {deskInsight.thesis}
                  </p>

                  <div className="pt-0.5 border-t border-amber-500/15 text-[11px] font-mono text-zinc-400">
                    <span className="text-zinc-500">Playbook: </span>
                    {deskInsight.strategy}
                  </div>
                </div>
              )}

              {/* Order Size Quick Selector: $5, $10, $20 */}
              <div className="pt-2 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                  <span className="uppercase tracking-wider">Select Order Size</span>
                  <span className="text-emerald-400 font-bold">${ticketSize.toFixed(2)} USD</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {PRESET_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      id={`detail-size-btn-${amt}`}
                      type="button"
                      onClick={() => handleSelectAmount(amt)}
                      className={`py-2.5 px-3 rounded-xl font-mono font-bold transition-all cursor-pointer flex flex-col items-center justify-center ${
                        ticketSize === amt && !isCustomSize
                          ? 'bg-emerald-500/15 border border-emerald-500 text-emerald-400 shadow-sm shadow-emerald-950/60'
                          : 'bg-zinc-950/70 border border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-white'
                      }`}
                    >
                      <span className="text-sm">${amt}</span>
                      <span className="text-[10px] text-zinc-500 font-normal">
                        {stock.livePrice && stock.livePrice > 0
                          ? `~${(amt / stock.livePrice).toFixed(3)} sh`
                          : ''}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Primary Action Button: Review Order */}
                <button
                  id={`detail-buy-btn`}
                  type="button"
                  onClick={() => setStep('quote')}
                  className="w-full py-4 px-4 rounded-xl font-mono text-base font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-all active:scale-[0.99] shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Review ${ticketSize} Order</span>
                  <span className="text-xs font-medium text-emerald-950/80">
                    (~{estimatedShares} shares)
                  </span>
                </button>
              </div>

              {/* Solana Wallet indicator or Paper hint */}
              <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-zinc-500 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-zinc-500" />
                <span>
                  {connected && publicKey
                    ? `Solana connected (${truncateAddress(publicKey.toBase58(), 4)})`
                    : 'Paper demo path active • Tap Review to preview quote'}
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: ORDER QUOTE VIEW */}
          {step === 'quote' && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <button
                    id="quote-back-btn"
                    type="button"
                    onClick={() => setStep('detail')}
                    className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <h3 className="text-base font-bold font-mono text-white">
                    Order Quote
                  </h3>
                </div>

                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  ${ticketSize.toFixed(2)} USD
                </span>
              </div>

              {/* Size Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                  <span>ORDER SIZE PRESETS</span>
                  <span className="text-emerald-400 font-bold">${ticketSize.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleSelectAmount(amt)}
                      className={`py-2 text-xs font-mono font-bold rounded-lg border transition-all cursor-pointer ${
                        ticketSize === amt && !isCustomSize
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                          : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
                <div className="pt-1">
                  <div className="relative flex items-center">
                    <span className="absolute left-3 font-mono text-xs text-zinc-500">$</span>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={customInput}
                      onChange={(e) => {
                        setIsCustomSize(true);
                        handleCustomChange(e.target.value);
                      }}
                      placeholder="Custom USD size"
                      className="w-full pl-7 pr-3 py-1.5 text-xs font-mono bg-zinc-950/80 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Quote Breakdown Card */}
              <div className="p-4 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Target Token:</span>
                  <span className="text-white font-bold">{stock.ticker} ({brandInfo.brand})</span>
                </div>

                <div className="flex items-center justify-between text-zinc-400">
                  <span>Order Size:</span>
                  <span className="text-white font-bold">${ticketSize.toFixed(2)} USD</span>
                </div>

                <div className="flex items-center justify-between text-zinc-400">
                  <span>Token Price:</span>
                  <span className="text-zinc-200">{formattedLivePrice}</span>
                </div>

                <div className="flex items-center justify-between text-zinc-400 pt-2 border-t border-zinc-800">
                  <span>Est. Tokens Received:</span>
                  <span className="text-emerald-400 font-bold text-sm flex items-center gap-1.5">
                    {quoting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    ) : (
                      <span>~{displayTokens} {stock.ticker}</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between text-zinc-400">
                  <span>Execution Route:</span>
                  <span className={connected ? (isTslaSwapSupported && jupQuote ? 'text-cyan-400 font-semibold' : 'text-emerald-400 font-semibold') : 'text-zinc-300'}>
                    {connected
                      ? (isTslaSwapSupported && jupQuote
                          ? `Jupiter DEX (${jupQuote.routePlan.map((r) => r.swapInfo.label).join(' → ') || 'Direct'})`
                          : isTslaSwapSupported && quoting
                          ? 'Querying Jupiter route...'
                          : 'Solana SPL Memo (Signed Intent)')
                      : 'Paper Trade (Simulated)'}
                  </span>
                </div>

                {isTslaSwapSupported && connected && jupQuote && (
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>Est. Price Impact:</span>
                    <span className="text-zinc-300 font-medium">
                      {jupQuote.priceImpactPct ? `${(parseFloat(jupQuote.priceImpactPct) * 100).toFixed(2)}%` : '< 0.01%'}
                    </span>
                  </div>
                )}

                {isTslaSwapSupported && (
                  <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-800/40 text-[11px] text-cyan-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>{connected ? 'Track B Active (Tesla):' : 'Track B Live Swaps (Tesla):'}</span>
                    </div>
                    <p className="text-cyan-300/80 leading-relaxed">
                      {connected
                        ? 'Real Solana Mainnet swap for TSLAx (Backed Tesla Token-2022). Submits directly to Jupiter DEX with zero memo fallback.'
                        : 'Connect Phantom or Solflare wallet in the top bar to execute live USDC → TSLAx swaps. Currently in simulated Paper mode.'}
                    </p>
                  </div>
                )}

                {quoteError && isTslaSwapSupported && connected && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
                    <div className="flex-1">
                      <span className="font-bold block">Jupiter Route Notice:</span>
                      <span className="text-[11px] text-amber-300/90">{quoteError}</span>
                    </div>
                  </div>
                )}

                {/* Only display slippage controls if a live Jupiter quote is active */}
                {connected && isTslaSwapSupported && jupQuote && (
                  <div className="flex items-center justify-between text-zinc-400 pt-1">
                    <span>Max Slippage:</span>
                    <div className="flex items-center gap-1.5">
                      {[0.5, 1.0, 2.0].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSlippage(s)}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                            slippage === s
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 font-bold'
                              : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
                          }`}
                        >
                          {s.toFixed(1)}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-zinc-400">
                  <span>Network Gas / Fee:</span>
                  <span className="text-zinc-400">&lt; $0.001 SOL</span>
                </div>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono leading-relaxed">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Confirm Action Button */}
              <div className="pt-2 flex flex-col gap-2">
                <button
                  id="quote-confirm-btn"
                  type="button"
                  onClick={handleConfirmTrade}
                  disabled={submitting || ticketSize <= 0 || (isTslaSwapSupported && connected && (quoting || !jupQuote))}
                  className={`w-full py-4 px-4 rounded-xl font-mono text-base font-bold transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                    isTslaSwapSupported && connected
                      ? 'bg-cyan-400 hover:bg-cyan-300 text-zinc-950 shadow-cyan-950/50'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-950/50'
                  }`}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{isTslaSwapSupported && connected ? 'Broadcasting Swap...' : 'Confirming Order...'}</span>
                    </>
                  ) : quoting && isTslaSwapSupported ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Fetching Jupiter Quote...</span>
                    </>
                  ) : isTslaSwapSupported && connected ? (
                    <>
                      <Zap className="w-4 h-4 fill-current" />
                      <span>Execute Live Swap (${ticketSize.toFixed(0)} USDC → TSLAx)</span>
                    </>
                  ) : connected ? (
                    <span>Sign Order Intent (${ticketSize.toFixed(0)})</span>
                  ) : (
                    <span>Confirm Paper Buy (${ticketSize.toFixed(0)})</span>
                  )}
                </button>

                <button
                  id="quote-cancel-btn"
                  type="button"
                  onClick={() => setStep('detail')}
                  disabled={submitting}
                  className="w-full py-2.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
