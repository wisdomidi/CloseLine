import React from 'react';
import { motion } from 'motion/react';
import { Check, ArrowLeft, ExternalLink } from 'lucide-react';
import { truncateAddress, getSolanaExplorerUrl } from '../solana';

interface ReceiptProps {
  ticker: string;
  name: string;
  usd: number;
  shares: string;
  price: number | null;
  status: string;
  tradeId: string;
  wallet?: string;
  txHash?: string;
  network?: string;
  inUsdc?: number;
  outTokens?: string;
  route?: string;
  priceImpactPct?: string;
  onBackToBoard: () => void;
}

export const Receipt: React.FC<ReceiptProps> = ({
  ticker,
  name,
  usd,
  shares,
  price,
  status,
  tradeId,
  wallet,
  txHash,
  network,
  inUsdc,
  outTokens,
  route,
  priceImpactPct,
  onBackToBoard,
}) => {
  const isFill = status === 'fill';
  const isSolana = status === 'wallet_connected_pending_swap' || status === 'solana_confirmed' || isFill;
  const isConfirmed = status === 'solana_confirmed' || isFill;
  const formattedPrice = price ? `$${price.toFixed(2)}` : '—';
  const nowStr = new Date().toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <motion.div
      id="fullscreen-receipt"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-between p-6 sm:p-10 overflow-y-auto font-sans antialiased text-zinc-100"
    >
      {/* Top spacer / header */}
      <div className="w-full max-w-md flex items-center justify-between pt-2">
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
          Transaction Receipt
        </span>
        <span className="text-xs font-mono text-zinc-400">
          {nowStr}
        </span>
      </div>

      {/* Main Center Area: Huge Check + Success details */}
      <div className="w-full max-w-md flex flex-col items-center my-auto py-6">
        {/* Huge Check */}
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 15, stiffness: 260, delay: 0.1 }}
          className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 flex items-center justify-center shadow-2xl mb-6 ${
            isFill
              ? 'bg-cyan-500/15 border-cyan-400/60 text-cyan-300 shadow-cyan-950/70'
              : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400 shadow-emerald-950/60'
          }`}
        >
          <Check className="w-14 h-14 sm:w-16 sm:h-16 stroke-[3]" />
        </motion.div>

        <h1 className="text-3xl sm:text-4xl font-mono font-black text-white text-center tracking-tight">
          {isFill ? 'Order Filled' : isConfirmed ? 'Intent Signed' : 'Paper Trade (Simulated)'}
        </h1>
        <p className={`text-lg font-mono text-center font-bold mt-1.5 ${isFill ? 'text-cyan-400' : 'text-emerald-400'}`}>
          ${(inUsdc || usd).toFixed(2)} USD • {ticker}
        </p>
        <p className="text-xs font-mono text-zinc-400 text-center mt-1">
          {name}
        </p>

        {/* Detailed Receipt Ticket */}
        <div className="w-full mt-6 p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2.5 font-mono text-xs shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 pb-2 border-b border-zinc-800/80">
            <span>{isFill ? 'Tokens Delivered:' : 'Estimated Token Size:'}</span>
            <span className={`font-bold text-sm ${isFill ? 'text-cyan-300' : 'text-emerald-400'}`}>
              {isFill ? '' : '~'}{outTokens || shares} {ticker}
            </span>
          </div>

          <div className="flex items-center justify-between text-zinc-400">
            <span>Order Value:</span>
            <span className="text-white font-semibold">${(inUsdc || usd).toFixed(2)} USD</span>
          </div>

          <div className="flex items-center justify-between text-zinc-400">
            <span>Reference Price:</span>
            <span className="text-zinc-200">{formattedPrice}</span>
          </div>

          <div className="flex items-center justify-between text-zinc-400">
            <span>Execution Type:</span>
            <span className={isFill ? 'text-cyan-400 font-semibold' : isConfirmed ? 'text-emerald-400 font-semibold' : isSolana ? 'text-amber-300 font-semibold' : 'text-zinc-300'}>
              {isFill ? 'Jupiter DEX Swap (Filled)' : isConfirmed ? 'Signed Intent (Solana SPL Memo)' : isSolana ? 'Wallet Intent (Pending)' : 'Paper Trade (Simulated)'}
            </span>
          </div>

          {route && (
            <div className="flex items-center justify-between text-zinc-400">
              <span>AMM Route:</span>
              <span className="text-zinc-300">{route}</span>
            </div>
          )}

          {priceImpactPct && (
            <div className="flex items-center justify-between text-zinc-400">
              <span>Price Impact:</span>
              <span className="text-zinc-300">{priceImpactPct}</span>
            </div>
          )}

          {/* Explicit truthfulness banner on receipt */}
          <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-[11px] text-zinc-400 leading-normal">
            {isFill ? (
              <span>
                <strong className="text-cyan-400 font-medium">Onchain Swap Settled:</strong> Real swap executed on Solana via Jupiter. {ticker} tokens delivered directly to your wallet address.
              </span>
            ) : isConfirmed ? (
              <span>
                <strong className="text-emerald-400 font-medium">Signed Intent:</strong> Cryptographic order ticket logged to Solana. No USDC or equity tokens were moved; awaiting settlement.
              </span>
            ) : (
              <span>
                <strong className="text-zinc-300 font-medium">Paper Trade (Simulated):</strong> Order logged to demo Firestore orderbook. No onchain transactions were executed.
              </span>
            )}
          </div>

          {wallet && (
            <div className="flex items-center justify-between text-zinc-400">
              <span>Wallet:</span>
              <span className="text-zinc-300">{truncateAddress(wallet, 6)}</span>
            </div>
          )}

          {txHash && (
            <div className="flex items-center justify-between text-zinc-400 pt-1">
              <span>Solana TX:</span>
              <a
                href={getSolanaExplorerUrl(txHash)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold"
              >
                <span>{truncateAddress(txHash, 5)}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          <div className="flex items-center justify-between text-zinc-500 pt-2 border-t border-zinc-800/80 text-[11px]">
            <span>Firestore Document ID:</span>
            <span className="text-emerald-400 font-mono font-semibold truncate max-w-[190px]">
              {tradeId}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Area: Back to board button + Required Disclaimer */}
      <div className="w-full max-w-md flex flex-col items-center gap-4 pb-2">
        <button
          id="receipt-back-to-board-btn"
          type="button"
          onClick={onBackToBoard}
          className="w-full py-4 px-6 rounded-xl font-mono font-bold text-sm bg-zinc-100 hover:bg-white text-zinc-950 transition-all active:scale-[0.99] shadow-xl flex items-center justify-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to board</span>
        </button>

        {/* Mandatory US-person disclaimer */}
        <p
          id="receipt-us-disclaimer"
          className="text-[11px] font-mono text-zinc-500 text-center leading-relaxed max-w-xs mx-auto"
        >
          These tokens are not for US persons. Not equity. Demo only.
        </p>
      </div>
    </motion.div>
  );
};
