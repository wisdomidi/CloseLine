import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, CheckCircle2, AlertCircle, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { DisplayStock, MarketSuggestionDoc } from '../types';
import { recordTrade } from '../firebase';
import { createCloseLineOrderTransaction, SOLANA_NETWORK } from '../solana';
import { getDeskRationale } from '../utils/deskTheses';

interface AfterHoursDeskCardProps {
  stock: DisplayStock;
  suggestion: MarketSuggestionDoc | null;
  sessionLabel?: string;
  onInspectStock?: (stock: DisplayStock) => void;
  onSkip: () => void;
  onTradeConfirmed?: (tradeInfo: {
    id: string;
    ticker: string;
    name: string;
    usd: number;
    shares: string;
    status: string;
    price: number | null;
    wallet?: string;
    txHash?: string;
  }) => void;
}

export const AfterHoursDeskCard: React.FC<AfterHoursDeskCardProps> = ({
  stock,
  suggestion,
  sessionLabel,
  onInspectStock,
  onSkip,
  onTradeConfirmed,
}) => {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const [submitting, setSubmitting] = useState(false);
  const [tradeSuccess, setTradeSuccess] = useState<{
    id: string;
    usd: number;
    shares: string;
    status: string;
    txHash?: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedSize, setSelectedSize] = useState<number>(suggestion?.usd || 5);
  const isPositive = stock.gap !== null && stock.gap >= 0;

  // Format gap with signed value
  const sign = stock.gapPercent && stock.gapPercent > 0 ? '+' : '';
  const gapNum = stock.gapPercent !== null ? stock.gapPercent.toFixed(2) : '0.00';
  const formattedGap = `${sign}${gapNum}%`;

  // Two-sentence reason: read market/suggestion if present for this ticker, else dynamic curated desk intelligence
  const deskIntel = getDeskRationale(stock.ticker, stock.gapPercent, selectedSize);
  let reasonText: string;
  let catalystText: string | null = deskIntel.catalyst;

  if (suggestion && suggestion.reason && (!suggestion.ticker || suggestion.ticker === stock.ticker)) {
    reasonText = suggestion.reason;
  } else {
    reasonText = deskIntel.thesis;
  }

  const estimatedShares = stock.livePrice && stock.livePrice > 0
    ? (selectedSize / stock.livePrice).toFixed(4)
    : '—';

  // Human clicks Confirm (reusing the same buy flow)
  const handleConfirm = async () => {
    if (!stock.livePrice || stock.livePrice <= 0) {
      setErrorMsg('Live price unavailable for this asset');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const isSolana = connected && publicKey;
      const walletAddress = isSolana ? publicKey.toBase58() : undefined;
      let txHash: string | undefined = undefined;
      let status = isSolana ? 'wallet_connected_pending_swap' : 'paper';

      if (isSolana && sendTransaction && connection) {
        try {
          const transaction = createCloseLineOrderTransaction(
            publicKey,
            stock.ticker,
            selectedSize,
            estimatedShares
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
        usd: selectedSize,
        ts: new Date(),
        status,
        wallet: walletAddress,
        shares: parseFloat(estimatedShares) || null,
        price: stock.livePrice,
        txHash,
        network: isSolana ? SOLANA_NETWORK : 'paper',
      });

      if (onTradeConfirmed) {
        onTradeConfirmed({
          id: tradeId,
          ticker: stock.ticker,
          name: stock.name,
          usd: selectedSize,
          shares: estimatedShares,
          status,
          price: stock.livePrice,
          wallet: walletAddress,
          txHash,
        });
      } else {
        setTradeSuccess({
          id: tradeId,
          usd: selectedSize,
          shares: estimatedShares,
          status,
          txHash,
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to record after-hours ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="after-hours-desk-card"
      className="w-full rounded-xl overflow-hidden bg-gradient-to-b from-amber-500/[0.07] via-zinc-900/90 to-zinc-900/70 border border-amber-500/30 shadow-xl shadow-black/40 p-4 transition-all"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Sparkles className="w-3 h-3 text-amber-400" />
            {sessionLabel?.toLowerCase().includes('weekend') ? 'Weekend Desk' : 'After-hours Desk'}
          </span>
          <span className="text-[10px] font-mono text-zinc-500 uppercase">
            Top Disparity
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-zinc-500">Size:</span>
          <div className="flex items-center gap-1">
            {[5, 10, 20].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setSelectedSize(amt)}
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded border transition-all cursor-pointer ${
                  selectedSize === amt
                    ? 'text-amber-300 bg-amber-500/20 border-amber-500/50'
                    : 'text-zinc-400 bg-zinc-950/60 border-zinc-800 hover:text-white'
                }`}
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Success feedback state */}
      <AnimatePresence>
        {tradeSuccess ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="py-3 px-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex flex-col gap-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-xs font-mono font-bold">
                  {tradeSuccess.status === 'solana_confirmed'
                    ? 'Solana Intent Signed'
                    : tradeSuccess.status === 'wallet_connected_pending_swap'
                    ? 'Wallet Intent Recorded'
                    : 'Paper Order Recorded'}
                </span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">
                #{tradeSuccess.id.slice(0, 6)}
              </span>
            </div>

            <p className="text-xs font-mono text-zinc-300">
              Purchased <strong className="text-white">${tradeSuccess.usd}</strong> of{' '}
              <strong className="text-white">{stock.ticker}</strong> (~{tradeSuccess.shares} shares)
            </p>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onSkip}
                className="text-[11px] font-mono text-zinc-400 hover:text-white px-2.5 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        ) : (
          <div>
            {/* Primary Asset & Gap Info */}
            <div className="flex items-center justify-between gap-2 py-1">
              <div
                className="flex items-baseline gap-2 cursor-pointer group"
                onClick={() => onInspectStock?.(stock)}
                title="Click to view asset details"
              >
                <span className="text-lg font-mono font-black text-white group-hover:text-amber-300 transition-colors">
                  {stock.ticker}
                </span>
                <span className="text-xs font-mono text-zinc-400 truncate max-w-[150px]">
                  {stock.name}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <div
                  className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-mono font-bold ${
                    isPositive
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {isPositive ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  <span>{formattedGap}</span>
                </div>
              </div>
            </div>

            {/* Two-sentence reason with clear AI Rationale badge */}
            <div className="mt-2.5 mb-3 px-3.5 py-2.5 rounded-lg bg-zinc-950/70 border border-amber-500/25 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Desk AI Rationale</span>
                </div>
                {catalystText && (
                  <span className="text-[9px] font-mono text-amber-300/80 bg-amber-500/10 px-1.5 py-0.5 rounded truncate max-w-[200px]">
                    {catalystText}
                  </span>
                )}
              </div>
              <p
                id="desk-reason-text"
                className="text-xs font-mono text-zinc-200 leading-relaxed"
              >
                {reasonText}
              </p>
            </div>

            {/* Error display if any */}
            {errorMsg && (
              <div className="mb-3 p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Action Buttons: Confirm $20 and Skip */}
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-800/60">
              <button
                id="desk-skip-btn"
                type="button"
                onClick={onSkip}
                disabled={submitting}
                className="px-3 py-1.5 rounded-lg text-xs font-mono text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors disabled:opacity-50"
              >
                Skip
              </button>

              <button
                id="desk-confirm-btn"
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className="px-4 py-1.5 rounded-lg text-xs font-mono font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-emerald-950/40"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Confirming...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm ${selectedSize}</span>
                    {connected && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-950/20 text-zinc-950 font-normal">
                        Solana
                      </span>
                    )}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
